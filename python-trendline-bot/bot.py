#!/usr/bin/env python3
"""DeepCharts-compatible trendline alert bot.

Reads alert anchor points from the Deepchartfinal6 API and evaluates the
same projected line against live tick messages from /ws. It does not place trades
or modify the API database.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse, urlunparse
from typing import Any

import requests
import websockets

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(),
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("deepcharts-trendline-bot")

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
APP_PIN = os.getenv("APP_PIN", "")
API_TOKEN = os.getenv("API_TOKEN", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
BOT_SEND_TELEGRAM = os.getenv("BOT_SEND_TELEGRAM", "true").lower() in ("1", "true", "yes", "on")
POLL_SECONDS = max(5, int(os.getenv("POLL_SECONDS", "15")))
TOUCH_TOLERANCE = 0.0002
DEDUP_SECONDS = 10


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if result == result and abs(result) != float("inf") else default
    except (TypeError, ValueError):
        return default


def timestamp_ms(value: Any) -> int:
    """Accept epoch seconds, epoch milliseconds, or ISO-8601 strings."""
    if isinstance(value, (int, float)):
        return int(value if value > 1e12 else value * 1000)
    text = str(value or "").strip()
    if text.isdigit():
        number = int(text)
        return number if number > 1e12 else number * 1000
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


@dataclass
class Alert:
    id: int
    symbol: str
    timeframe: str
    drawing_type: str
    condition: str
    p1: float
    t1: int
    p2: float
    t2: int
    notes: str = ""
    telegram_enabled: bool = True
    display_id: str = ""
    last_side: str | None = None
    last_sample: tuple[float, float] | None = None
    retest_side: str | None = None
    retest_moved_away: bool = False
    rejection_side: str | None = None
    in_band: bool = False
    last_fired: float = 0.0
    fired: bool = False


def line_price(alert: Alert, tick_time_ms: int) -> float | None:
    if alert.t2 == alert.t1:
        return None
    if alert.drawing_type == "horizontal_line":
        return alert.p1
    slope = (alert.p2 - alert.p1) / (alert.t2 - alert.t1)
    if alert.drawing_type == "trendline" and not (alert.t1 <= tick_time_ms <= alert.t2):
        return None
    if alert.drawing_type == "ray" and tick_time_ms < alert.t1:
        return None
    return alert.p1 + slope * (tick_time_ms - alert.t1)


def touch_tolerance(symbol: str, price: float) -> float:
    symbol = symbol.upper().strip()
    for suffix in (".PRO", ".RAW", ".ECN", ".STD"):
        if symbol.endswith(suffix):
            symbol = symbol[:-len(suffix)]
    if symbol.endswith("JPY"):
        return 0.0001
    if len(symbol) == 6 and symbol.isalpha():
        return 0.00001
    return max(0.00001, min(abs(price) * 0.000002, 0.01))


def parse_alert(row: dict[str, Any]) -> Alert | None:
    try:
        if not row.get("isActive", True) or row.get("alertStatus", "active") == "paused":
            return None
        if row.get("isTriggered", False):
            return None
        drawing_type = str(row.get("drawingType") or "trendline")
        if drawing_type == "rectangle":
            return None
        alert = Alert(
            id=int(row["id"]),
            symbol=str(row["symbol"]).upper().strip(),
            timeframe=str(row.get("timeframe") or "1H"),
            drawing_type=drawing_type,
            condition=str(row.get("condition") or "breakout"),
            p1=as_float(row.get("point1Price")),
            t1=timestamp_ms(row.get("point1Time")),
            p2=as_float(row.get("point2Price")),
            t2=timestamp_ms(row.get("point2Time")),
            notes=str(row.get("notes") or ""),
            telegram_enabled=bool(row.get("telegramEnabled", True)),
            display_id=str(row.get("drawingDisplayId") or ""),
        )
        if alert.p1 <= 0 or alert.p2 <= 0 or alert.t1 == alert.t2:
            return None
        return alert
    except (KeyError, TypeError, ValueError, OverflowError):
        log.exception("Skipping invalid trendline alert row")
        return None


class DeepChartsBot:
    def __init__(self) -> None:
        if not API_BASE_URL:
            raise RuntimeError("Set API_BASE_URL to your DeepCharts API server URL.")
        self.session = requests.Session()
        self.token = API_TOKEN
        self.alerts: dict[int, Alert] = {}
        self.last_prices: dict[str, float] = {}
        self.ws = None
        self.subscribed_symbols: set[str] = set()
        self.running = True

    def authenticate(self) -> None:
        if self.token or not APP_PIN:
            return
        response = self.session.post(
            f"{API_BASE_URL}/api/auth/verify-pin", json={"pin": APP_PIN}, timeout=15
        )
        response.raise_for_status()
        data = response.json()
        self.token = str(data.get("token") or "")
        if not data.get("ok") or not self.token:
            raise RuntimeError("API PIN verification failed.")

    def request(self, path: str) -> requests.Response:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        response = self.session.get(f"{API_BASE_URL}{path}", headers=headers, timeout=20)
        response.raise_for_status()
        return response

    def load_alerts(self, initial: bool = False) -> None:
        rows = self.request("/api/trendlines").json()
        if not isinstance(rows, list):
            raise RuntimeError("Expected /api/trendlines to return a JSON array.")
        incoming = {}
        for row in rows:
            alert = parse_alert(row)
            if alert is not None:
                incoming[alert.id] = alert

        if initial:
            self.alerts = incoming
        else:
            # Keep local state after the server engine fires the same alert, so this
            # independent process can still evaluate the tick. Honour pause/delete
            # and edits made in the chart UI.
            by_id = {int(r["id"]): r for r in rows if str(r.get("id", "")).isdigit()}
            for alert_id in list(self.alerts):
                row = by_id.get(alert_id)
                if row is None or not row.get("isActive", True) or row.get("alertStatus") == "paused":
                    self.alerts.pop(alert_id, None)
                elif alert_id in incoming:
                    old, fresh = self.alerts[alert_id], incoming[alert_id]
                    same_line = (old.p1, old.t1, old.p2, old.t2, old.condition) == (
                        fresh.p1, fresh.t1, fresh.p2, fresh.t2, fresh.condition
                    )
                    if same_line:
                        fresh.last_side = old.last_side
                        fresh.last_sample = old.last_sample
                        fresh.retest_side = old.retest_side
                        fresh.retest_moved_away = old.retest_moved_away
                        fresh.rejection_side = old.rejection_side
                        fresh.in_band = old.in_band
                        fresh.last_fired = old.last_fired
                        fresh.fired = old.fired
                    self.alerts[alert_id] = fresh
            for alert_id, alert in incoming.items():
                if alert_id not in self.alerts:
                    self.alerts[alert_id] = alert

        symbols = sorted({a.symbol for a in self.alerts.values()})
        log.info("Loaded %d active line alerts; symbols=%s",
                 len(self.alerts), ", ".join(symbols) or "(none)")

    def ws_url(self) -> str:
        parsed = urlparse(API_BASE_URL)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        query = urlencode({"token": self.token}) if self.token else ""
        return urlunparse((scheme, parsed.netloc, "/ws", "", query, ""))

    async def send_telegram(self, text: str) -> None:
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            log.info("ALERT: %s", text.replace("\n", " | "))
            return
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        try:
            response = await asyncio.to_thread(
                requests.post, url,
                json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "disable_web_page_preview": True},
                timeout=15,
            )
            response.raise_for_status()
        except Exception:
            log.exception("Telegram delivery failed")

    async def handle_tick(self, tick: dict[str, Any]) -> None:
        symbol = str(tick.get("symbol") or "").upper().strip()
        price = as_float(tick.get("price"))
        if not symbol or price <= 0:
            return
        try:
            tick_time = timestamp_ms(tick.get("timestamp") or tick.get("receivedAt") or time.time())
        except (ValueError, TypeError, OverflowError):
            tick_time = int(time.time() * 1000)

        self.last_prices[symbol] = price
        for alert in list(self.alerts.values()):
            if alert.symbol != symbol or alert.fired:
                continue
            projected = line_price(alert, tick_time)
            if projected is None or projected == 0:
                continue

            side = "above" if price >= projected else "below"
            last_side = alert.last_side
            alert.last_side = side
            distance_pct = abs(price - projected) / abs(projected)
            in_touch_band = distance_pct <= TOUCH_TOLERANCE
            condition = alert.condition
            fire = False

            # First tick only seeds state; do not instantly fire a newly loaded alert.
            if last_side is None:
                alert.last_sample = (price, projected)
                alert.in_band = in_touch_band
                continue

            if condition in ("break", "breakout"):
                fire = side != last_side
            elif condition == "cross_above":
                fire = side == "above" and last_side == "below"
            elif condition == "cross_below":
                fire = side == "below" and last_side == "above"
            elif condition in ("touch", "touch_price"):
                fire = abs(price - projected) <= touch_tolerance(symbol, price)
            elif condition == "above_price":
                fire = side == "above" and last_side == "below"
            elif condition == "below_price":
                fire = side == "below" and last_side == "above"
            elif condition == "enter_zone":
                fire = in_touch_band and not alert.in_band
                alert.in_band = in_touch_band
            elif condition == "exit_zone":
                fire = not in_touch_band and alert.in_band
                alert.in_band = in_touch_band
            elif condition == "retest":
                if alert.retest_side is None:
                    if side != last_side:
                        alert.retest_side = side
                        alert.retest_moved_away = False
                elif not alert.retest_moved_away:
                    if not in_touch_band:
                        alert.retest_moved_away = True
                elif in_touch_band:
                    fire = True
                    alert.retest_side = None
                    alert.retest_moved_away = False
            elif condition == "rejection":
                if in_touch_band:
                    alert.rejection_side = side
                elif alert.rejection_side and side == alert.rejection_side:
                    fire = True
                    alert.rejection_side = None
                elif alert.rejection_side and side != alert.rejection_side:
                    alert.rejection_side = None
            elif condition == "atr_proximity":
                # Exact ATR parity requires the API's candle aggregator/history.
                continue

            alert.last_sample = (price, projected)
            if not fire:
                continue
            now = time.monotonic()
            if now - alert.last_fired < DEDUP_SECONDS:
                continue
            alert.last_fired = now
            alert.fired = True
            direction = "crossed above" if side == "above" else "crossed below"
            label = {
                "touch": "Trendline Touch", "touch_price": "Price Touch",
                "break": "Trendline Break", "breakout": "Trendline Breakout",
                "cross_above": "Cross Above", "cross_below": "Cross Below",
                "retest": "Trendline Retest", "rejection": "Trendline Rejection",
                "above_price": "Above Trendline", "below_price": "Below Trendline",
                "enter_zone": "Entered Proximity", "exit_zone": "Exited Proximity",
            }.get(condition, condition.replace("_", " ").title())
            lines = [
                "DEEPCHARTS TRENDLINE ALERT",
                f"Symbol: {symbol}",
                f"Timeframe: {alert.timeframe}",
                f"Condition: {label}",
                f"Line price: {projected:.8f}",
                f"Triggered price: {price:.8f}",
                f"Direction: {direction}",
                f"Drawing: {alert.drawing_type}" + (f" ({alert.display_id})" if alert.display_id else ""),
                f"Time: {utc_now()}",
            ]
            if alert.notes:
                lines.append(f"Note: {alert.notes}")
            message = "\n".join(lines)
            log.warning("%s", message.replace("\n", " | "))
            if BOT_SEND_TELEGRAM:
                await self.send_telegram(message)

    async def run_ws(self) -> None:
        while self.running:
            try:
                async with websockets.connect(
                    self.ws_url(), ping_interval=20, ping_timeout=20, close_timeout=5
                ) as ws:
                    self.ws = ws
                    self.subscribed_symbols = set()
                    log.info("Connected to DeepCharts WebSocket")
                    await self.subscribe_new_symbols()
                    async for raw in ws:
                        try:
                            message = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if message.get("type") == "tick":
                            await self.handle_tick(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("WebSocket disconnected (%s); retrying in 3 seconds", exc)
                await asyncio.sleep(3)
            finally:
                self.ws = None
                self.subscribed_symbols = set()

    async def subscribe_new_symbols(self) -> None:
        if self.ws is None:
            return
        symbols = sorted({a.symbol for a in self.alerts.values()} - self.subscribed_symbols)
        for symbol in symbols:
            timeframe = next((a.timeframe for a in self.alerts.values() if a.symbol == symbol), "1H")
            await self.ws.send(json.dumps({
                "type": "subscribe_candles", "symbol": symbol, "interval": timeframe
            }))
            self.subscribed_symbols.add(symbol)
            log.info("Requested live market subscription: %s", symbol)

    async def poll_alerts(self) -> None:
        while self.running:
            await asyncio.sleep(POLL_SECONDS)
            try:
                self.load_alerts(initial=False)
                await self.subscribe_new_symbols()
            except Exception:
                log.exception("Could not refresh trendline alerts")

    async def run(self) -> None:
        self.authenticate()
        self.load_alerts(initial=True)
        await asyncio.gather(self.run_ws(), self.poll_alerts())


def main() -> None:
    try:
        asyncio.run(DeepChartsBot().run())
    except KeyboardInterrupt:
        log.info("Stopped by user")
    except Exception as exc:
        log.error("%s", exc)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
