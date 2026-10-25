#!/usr/bin/env python3
"""Telegram trendline alert bot: Bybit crypto + Kotak Neo Indian markets."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests
import websockets
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("telegram-trendline-bot")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALLOWED_IDS = {x.strip() for x in os.getenv("TELEGRAM_ALLOWED_USER_IDS", "").split(",") if x.strip()}
STATE_FILE = Path(os.getenv("TRENDLINE_STATE_FILE", "trendline_alerts.json"))
BYBIT_CATEGORY = os.getenv("BYBIT_CATEGORY", "linear")
BYBIT_WS = "wss://stream.bybit.com/v5/public/" + BYBIT_CATEGORY
BYBIT_REST = "https://api.bybit.com/v5/market/kline"
IST = ZoneInfo("Asia/Kolkata")
UTC = timezone.utc

KOTAK_CONSUMER_KEY = os.getenv("KOTAK_CONSUMER_KEY", "")
KOTAK_MOBILE_NUMBER = os.getenv("KOTAK_MOBILE_NUMBER", "")
KOTAK_UCC = os.getenv("KOTAK_UCC", "")
KOTAK_MPIN = os.getenv("KOTAK_MPIN", "")
KOTAK_TOTP_SECRET = os.getenv("KOTAK_TOTP_SECRET", "")
KOTAK_TOTP = os.getenv("KOTAK_TOTP", "")

BYBIT_INTERVALS = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1D": "D", "1W": "W", "1M": "M",
}
KOTAK_INTERVALS = {
    "1m": "1min", "3m": "3min", "5m": "5min", "10m": "10min",
    "15m": "15min", "30m": "30min", "1h": "60min", "1D": "D", "1W": "W",
}
CONDITIONS = {
    "breakout": "Breakout (either side)",
    "cross_above": "Cross Above",
    "cross_below": "Cross Below",
    "touch": "Touch",
}
DRAWINGS = {"ray": "Trendline extended right", "trendline": "Between two points", "horizontal_line": "Horizontal line"}
POLL_SECONDS = max(5, int(os.getenv("POLL_SECONDS", "15")))


def parse_time(value: str) -> int:
    """Parse a point time entered in IST as DD-MM-YYYY HH:MM or YYYY-MM-DD HH:MM."""
    value = value.strip()
    parsed = None
    for fmt in ("%d-%m-%Y %H:%M", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"):
        try:
            parsed = datetime.strptime(value, fmt)
            break
        except ValueError:
            pass
    if parsed is None:
        raise ValueError("Time format correct kaadu. DD-MM-YYYY HH:MM format use cheyyandi.")
    return int(parsed.replace(tzinfo=IST).timestamp() * 1000)


def fmt_time(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=UTC).astimezone(IST).strftime("%d-%m-%Y %H:%M IST")


def as_float(value: Any) -> float:
    result = float(value)
    if not (result > 0 and result < float("inf")):
        raise ValueError("Price positive number undaali.")
    return result


def allowed(update: Update) -> bool:
    user = update.effective_user
    return bool(user and ALLOWED_IDS and str(user.id) in ALLOWED_IDS)


def load_alerts() -> list[dict[str, Any]]:
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        log.exception("Unable to read alert state file")
        return []


def save_alerts(alerts: list[dict[str, Any]]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(alerts, indent=2), encoding="utf-8")
    temp.replace(STATE_FILE)


class MarketData:
    def __init__(self, app: Application) -> None:
        self.app = app
        self.alerts = load_alerts()
        self.bybit_ws = None
        self.kotak_ws = None
        self.bybit_symbols: set[str] = set()
        self.kotak_symbols: set[str] = set()
        self.neo = None
        self.kotak_task: asyncio.Task | None = None
        self.bybit_task: asyncio.Task | None = None
        self.stopping = False

    async def start(self) -> None:
        if not BOT_TOKEN:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is missing.")
        if not ALLOWED_IDS:
            raise RuntimeError("Security: set TELEGRAM_ALLOWED_USER_IDS to your Telegram numeric user ID.")
        self.bybit_task = asyncio.create_task(self.run_bybit(), name="bybit-feed")
        if KOTAK_CONSUMER_KEY:
            self.kotak_task = asyncio.create_task(self.run_kotak(), name="kotak-feed")
        log.info("Bot started. Saved alerts: %d", len(self.alerts))
        for alert in self.alerts:
            await self.subscribe(alert)

    async def stop(self) -> None:
        self.stopping = True
        for task in (self.bybit_task, self.kotak_task):
            if task:
                task.cancel()
        await asyncio.gather(*(t for t in (self.bybit_task, self.kotak_task) if t), return_exceptions=True)

    async def subscribe(self, alert: dict[str, Any]) -> None:
        if alert["market"] == "crypto":
            symbol = alert["symbol"].upper()
            if symbol not in self.bybit_symbols:
                self.bybit_symbols.add(symbol)
                if self.bybit_ws:
                    await self.bybit_ws.send(json.dumps({"op": "subscribe", "args": [f"publicTrade.{symbol}"]}))
        else:
            key = alert["symbol"]
            if key not in self.kotak_symbols:
                self.kotak_symbols.add(key)
                if self.kotak_ws:
                    await self.kotak_subscribe(key)

    async def run_bybit(self) -> None:
        while not self.stopping:
            try:
                async with websockets.connect(BYBIT_WS, ping_interval=20, ping_timeout=20) as ws:
                    self.bybit_ws = ws
                    self.bybit_symbols = set()
                    symbols = sorted({a["symbol"].upper() for a in self.alerts if a["market"] == "crypto" and a.get("active", True)})
                    if symbols:
                        await ws.send(json.dumps({"op": "subscribe", "args": [f"publicTrade.{s}" for s in symbols]}))
                        self.bybit_symbols.update(symbols)
                    log.info("Bybit public WebSocket connected")
                    async for raw in ws:
                        message = json.loads(raw)
                        topic = str(message.get("topic", ""))
                        if not topic.startswith("publicTrade."):
                            continue
                        for trade in message.get("data", []):
                            await self.on_tick("crypto", str(trade.get("s", "")).upper(), float(trade.get("p", 0)), int(trade.get("T", time.time() * 1000)))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("Bybit WebSocket disconnected: %s; retrying", exc)
                await asyncio.sleep(3)
            finally:
                self.bybit_ws = None
                self.bybit_symbols.clear()

    async def ensure_kotak_client(self):
        if self.neo is not None:
            return self.neo
        if not KOTAK_CONSUMER_KEY:
            raise RuntimeError("Kotak Neo credentials configure cheyyaledu.")
        from neo_api_client import NeoAPI
        self.neo = NeoAPI(consumer_key=KOTAK_CONSUMER_KEY, environment=os.getenv("KOTAK_ENVIRONMENT", "prod"))
        return self.neo

    async def kotak_login(self, client) -> None:
        if not (KOTAK_MOBILE_NUMBER and KOTAK_UCC and KOTAK_MPIN and (KOTAK_TOTP_SECRET or KOTAK_TOTP)):
            raise RuntimeError("Kotak live feed kosam KOTAK_MOBILE_NUMBER, KOTAK_UCC, KOTAK_MPIN, KOTAK_TOTP_SECRET configure cheyyali.")
        totp = KOTAK_TOTP
        if KOTAK_TOTP_SECRET:
            import pyotp
            totp = pyotp.TOTP(KOTAK_TOTP_SECRET).now()
        await asyncio.to_thread(
            client.totp_login,
            mobile_number=KOTAK_MOBILE_NUMBER,
            ucc=KOTAK_UCC,
            totp=totp,
        )
        await asyncio.to_thread(client.totp_validate, mpin=KOTAK_MPIN)

    async def run_kotak(self) -> None:
        while not self.stopping:
            try:
                client = await self.ensure_kotak_client()
                await self.kotak_login(client)
                async with client.create_websocket() as ws:
                    self.kotak_ws = ws
                    self.kotak_symbols = set()
                    symbols = sorted({a["symbol"] for a in self.alerts if a["market"] == "india" and a.get("active", True)})
                    for symbol in symbols:
                        await self.kotak_subscribe(symbol)
                    log.info("Kotak Neo SFeed WebSocket connected")
                    from neo_api_client.websocket.feed import SFeedIndex, SFeedScrip
                    async for message in ws:
                        if isinstance(message, SFeedIndex):
                            symbol = "nse_cm|Nifty 50"
                            price = getattr(message, "last_traded_price", 0)
                            stamp = getattr(message, "last_update_time", 0) or time.time()
                            await self.on_tick("india", symbol, float(price or 0), int(stamp * 1000 if stamp < 1e12 else stamp))
                        elif isinstance(message, SFeedScrip):
                            segment = str(getattr(message, "exchange_segment", "nse_cm"))
                            token = str(getattr(message, "instrument_token", ""))
                            symbol = f"{segment}|{token}"
                            price = getattr(message, "last_traded_price", 0)
                            stamp = getattr(message, "last_trade_time", 0) or getattr(message, "last_update_time", 0) or time.time()
                            await self.on_tick("india", symbol, float(price or 0), int(stamp * 1000 if stamp < 1e12 else stamp))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.exception("Kotak Neo feed disconnected/error: %s", exc)
                self.neo = None
                await asyncio.sleep(5)
            finally:
                self.kotak_ws = None
                self.kotak_symbols.clear()

    async def kotak_subscribe(self, symbol: str) -> None:
        if not self.kotak_ws:
            return
        from neo_api_client.websocket.feed import WsToken
        segment, token = split_kotak_symbol(symbol)
        if token.lower() == "nifty 50":
            await self.kotak_ws.subscribe_index([WsToken(segment, token)])
        else:
            await self.kotak_ws.subscribe_scrips([WsToken(segment, token)])

    async def historical(self, market: str, symbol: str, timeframe: str) -> list[list[Any]]:
        if market == "crypto":
            interval = BYBIT_INTERVALS[timeframe]
            response = await asyncio.to_thread(
                requests.get, BYBIT_REST,
                params={"category": BYBIT_CATEGORY, "symbol": symbol.upper(), "interval": interval, "limit": 50},
                timeout=15,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("retCode") != 0:
                raise RuntimeError(payload.get("retMsg", "Bybit historical candles error"))
            rows = payload.get("result", {}).get("list", [])
            return [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in reversed(rows)]
        client = await self.ensure_kotak_client()
        interval = KOTAK_INTERVALS[timeframe]
        days = 7 if interval in ("1min", "3min", "5min") else 30 if interval in ("10min", "15min") else 60 if interval in ("30min", "60min") else 150
        today = datetime.now(IST).date()
        start = today - timedelta(days=days)
        result = await asyncio.to_thread(
            client.historical_data,
            neosymbol=symbol,
            interval=interval,
            from_date=start.strftime("%Y-%m-%d"),
            to_date=today.strftime("%Y-%m-%d"),
        )
        if not isinstance(result, dict) or result.get("status") != "success":
            raise RuntimeError(str(result)[:500])
        candles = result.get("data", {}).get("candles", [])
        rows = []
        for row in candles:
            stamp = datetime.fromisoformat(str(row[0]).replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=IST)
            rows.append([int(stamp.timestamp() * 1000), *[float(x or 0) for x in row[1:6]]])
        return rows

    async def on_tick(self, market: str, symbol: str, price: float, timestamp_ms: int) -> None:
        if not symbol or price <= 0:
            return
        for alert in self.alerts:
            if not alert.get("active", True) or alert.get("fired") or alert["market"] != market:
                continue
            if alert["symbol"].upper() != symbol.upper():
                continue
            projected = projected_price(alert, timestamp_ms)
            if projected is None or projected <= 0:
                continue
            side = "above" if price >= projected else "below"
            previous = alert.get("last_side")
            alert["last_side"] = side
            if previous is None:
                save_alerts(self.alerts)
                continue
            cond = alert["condition"]
            fire = (
                (cond == "breakout" and side != previous)
                or (cond == "cross_above" and side == "above" and previous == "below")
                or (cond == "cross_below" and side == "below" and previous == "above")
                or (cond == "touch" and abs(price - projected) <= tick_tolerance(symbol, price))
            )
            if not fire:
                continue
            alert["fired"] = True
            alert["active"] = False
            alert["triggered_price"] = price
            alert["triggered_line_price"] = projected
            alert["triggered_at"] = timestamp_ms
            save_alerts(self.alerts)
            text = (
                "TRENDLINE ALERT TRIGGERED\n"
                f"Market: {'Bybit Crypto' if market == 'crypto' else 'Kotak Neo India'}\n"
                f"Symbol: {alert['display_symbol']}\n"
                f"Timeframe: {alert['timeframe']}\n"
                f"Condition: {CONDITIONS.get(cond, cond)}\n"
                f"Line price: {projected:.8f}\n"
                f"Live price: {price:.8f}\n"
                f"Time: {fmt_time(timestamp_ms)}"
            )
            log.warning(text.replace("\n", " | "))
            try:
                await self.app.bot.send_message(chat_id=alert["chat_id"], text=text)
            except Exception:
                log.exception("Could not send Telegram alert")


def split_kotak_symbol(symbol: str) -> tuple[str, str]:
    symbol = symbol.strip()
    if "|" in symbol:
        segment, token = symbol.split("|", 1)
        return segment.strip(), token.strip()
    if symbol.upper() in ("NIFTY50", "NIFTY 50", "NIFTY"):
        return "nse_cm", "Nifty 50"
    raise ValueError("Kotak symbol ni nse_cm|TOKEN format lo enter cheyyandi. Example: nse_cm|11536. NIFTY50 kosam NIFTY 50 type cheyyandi.")


def projected_price(alert: dict[str, Any], tick_ms: int) -> float | None:
    t1, t2 = int(alert["p1_time"]), int(alert["p2_time"])
    p1, p2 = float(alert["p1_price"]), float(alert["p2_price"])
    drawing = alert.get("drawing_type", "ray")
    if drawing == "horizontal_line":
        return p1
    if t1 == t2:
        return None
    if drawing == "trendline" and not (t1 <= tick_ms <= t2):
        return None
    if drawing == "ray" and tick_ms < t1:
        return None
    return p1 + ((p2 - p1) / (t2 - t1)) * (tick_ms - t1)


def tick_tolerance(symbol: str, price: float) -> float:
    s = symbol.upper().replace(".PRO", "").replace(".RAW", "").replace(".ECN", "").replace(".STD", "")
    if s.endswith("JPY"):
        return 0.0001
    if len(s) == 6 and s.isalpha():
        return 0.00001
    return max(0.00001, min(abs(price) * 0.000002, 0.01))


def get_hub(context: ContextTypes.DEFAULT_TYPE) -> MarketData:
    return context.application.bot_data["hub"]


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        await update.effective_message.reply_text("Access denied. Bot owner Telegram ID allowlist lo ledu.")
        return
    keyboard = [[InlineKeyboardButton("Create trendline alert", callback_data="start_trendline")],
                [InlineKeyboardButton("My alerts", callback_data="list_alerts")]]
    await update.effective_message.reply_text(
        "DeepCharts Trendline Bot\n/trendline nokki trendline create cheyyandi.",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def trendline_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        await update.effective_message.reply_text("Access denied. TELEGRAM_ALLOWED_USER_IDS configure cheyyandi.")
        return
    await show_market_menu(update, context, use_query=False)


async def show_market_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, use_query: bool = True) -> None:
    keyboard = [
        [InlineKeyboardButton("Crypto — Bybit", callback_data="market:crypto")],
        [InlineKeyboardButton("Stocks / NIFTY 50 — Kotak Neo", callback_data="market:india")],
    ]
    markup = InlineKeyboardMarkup(keyboard)
    if use_query and update.callback_query:
        await update.callback_query.edit_message_text("Market select cheyyandi:", reply_markup=markup)
    else:
        await update.effective_message.reply_text("Market select cheyyandi:", reply_markup=markup)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    if not allowed(update):
        await query.edit_message_text("Access denied.")
        return
    data = query.data or ""
    user_data = context.user_data
    hub = get_hub(context)

    if data == "start_trendline":
        await show_market_menu(update, context)
        return
    if data == "market:crypto":
        user_data.clear()
        user_data["market"] = "crypto"
        await query.edit_message_text("Bybit symbol enter cheyyandi (example: BTCUSDT, ETHUSDT).")
        user_data["awaiting"] = "symbol"
        return
    if data == "market:india":
        user_data.clear()
        user_data["market"] = "india"
        await query.edit_message_text(
            "Kotak Neo symbol enter cheyyandi:\n"
            "NIFTY 50 index kosam: NIFTY 50\n"
            "Stock kosam scrip token format: nse_cm|TOKEN\n"
            "Example: nse_cm|11536\n\n"
            "Kotak Neo API credentials configure chesi undaali."
        )
        user_data["awaiting"] = "symbol"
        return
    if data.startswith("tf:"):
        timeframe = data.split(":", 1)[1]
        user_data["timeframe"] = timeframe
        market, symbol = user_data["market"], user_data["symbol"]
        try:
            candles = await hub.historical(market, symbol, timeframe)
            user_data["candles"] = candles
            if not candles:
                raise RuntimeError("Ee timeframe ki historical candles dorakaledu.")
            sample = candles[-5:]
            lines = [f"Historical OHLC preview — {user_data['display_symbol']} / {timeframe} (IST)"]
            for row in sample:
                stamp = fmt_time(int(row[0]))
                lines.append(f"{stamp} | O {row[1]} H {row[2]} L {row[3]} C {row[4]}")
            lines.append("\nPoint 1 enter cheyyandi:")
            lines.append("Format: PRICE, DD-MM-YYYY HH:MM")
            lines.append("Example: 25120.5, 25-10-2026 10:15")
            user_data["awaiting"] = "p1"
            await query.edit_message_text("\n".join(lines))
        except Exception as exc:
            log.exception("Historical fetch failed")
            await query.edit_message_text(f"Historical OHLC fetch fail ayyindi: {exc}")
        return
    if data.startswith("condition:"):
        condition = data.split(":", 1)[1]
        user_data["condition"] = condition
        keyboard = [[InlineKeyboardButton(label, callback_data=f"drawing:{key}")] for key, label in DRAWINGS.items()]
        await query.edit_message_text("Trendline style select cheyyandi:", reply_markup=InlineKeyboardMarkup(keyboard))
        return
    if data.startswith("drawing:"):
        drawing = data.split(":", 1)[1]
        user_data["drawing_type"] = drawing
        try:
            p1 = float(user_data["p1_price"])
            p2 = float(user_data["p2_price"])
            t1, t2 = int(user_data["p1_time"]), int(user_data["p2_time"])
            if t1 >= t2 and drawing != "horizontal_line":
                raise ValueError("Point 2 time, Point 1 time kanna later undaali.")
            if drawing == "horizontal_line":
                p2 = p1
            hub_alert = {
                "id": int(time.time() * 1000),
                "market": user_data["market"],
                "symbol": user_data["symbol"],
                "display_symbol": user_data["display_symbol"],
                "timeframe": user_data["timeframe"],
                "condition": user_data["condition"],
                "drawing_type": drawing,
                "p1_price": p1, "p1_time": t1, "p2_price": p2, "p2_time": t2,
                "chat_id": update.effective_chat.id,
                "active": True, "fired": False, "last_side": None,
                "created_at": int(time.time() * 1000),
            }
            hub.alerts.append(hub_alert)
            save_alerts(hub.alerts)
            await hub.subscribe(hub_alert)
            projected = projected_price(hub_alert, int(time.time() * 1000))
            summary = (
                "TRENDLINE CREATED\n"
                f"Market: {'Bybit Crypto' if hub_alert['market'] == 'crypto' else 'Kotak Neo India'}\n"
                f"Symbol: {hub_alert['display_symbol']}\n"
                f"Timeframe: {hub_alert['timeframe']}\n"
                f"Condition: {CONDITIONS[hub_alert['condition']]}\n"
                f"Point 1: {p1} @ {fmt_time(t1)}\n"
                f"Point 2: {p2} @ {fmt_time(t2)}\n"
                f"Style: {DRAWINGS[drawing]}\n"
                f"Current projected line price: {projected:.8f}" if projected is not None else
                "TRENDLINE CREATED\nLine future timestamp range lo inka active kaadu."
            )
            await query.edit_message_text(summary)
            user_data.clear()
        except Exception as exc:
            await query.edit_message_text(f"Trendline create cheyyalekapoyanu: {exc}\n/trendline malli try cheyyandi.")
            user_data.clear()
        return
    if data == "list_alerts":
        active = [a for a in hub.alerts if a.get("chat_id") == update.effective_chat.id and a.get("active")]
        if not active:
            await query.edit_message_text("Active alerts levu. /trendline tho create cheyyandi.")
        else:
            lines = ["Mee active trendline alerts:"]
            for a in active[-20:]:
                lines.append(f"#{a['id']} {a['display_symbol']} {a['timeframe']} — {CONDITIONS.get(a['condition'], a['condition'])}")
            await query.edit_message_text("\n".join(lines))
        return


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        await update.effective_message.reply_text("Access denied.")
        return
    data = context.user_data
    awaiting = data.get("awaiting")
    if not awaiting:
        await update.effective_message.reply_text("/trendline use cheyyandi.")
        return
    text = (update.effective_message.text or "").strip()

    if awaiting == "symbol":
        market = data["market"]
        if market == "crypto":
            symbol = text.upper().replace("/", "")
            if not symbol.isalnum() or not symbol.endswith(("USDT", "USDC")):
                await update.effective_message.reply_text("Valid Bybit symbol enter cheyyandi. Example: BTCUSDT")
                return
            data["symbol"] = symbol
            data["display_symbol"] = symbol
            intervals = BYBIT_INTERVALS
        else:
            try:
                segment, token = split_kotak_symbol(text)
            except ValueError as exc:
                await update.effective_message.reply_text(str(exc))
                return
            data["symbol"] = f"{segment}|{token}"
            data["display_symbol"] = "NIFTY 50" if token.lower() == "nifty 50" else f"{segment}|{token}"
            intervals = KOTAK_INTERVALS
        keyboard = []
        row = []
        for label in intervals:
            row.append(InlineKeyboardButton(label, callback_data=f"tf:{label}"))
            if len(row) == 3:
                keyboard.append(row)
                row = []
        if row:
            keyboard.append(row)
        data["awaiting"] = "timeframe"
        await update.effective_message.reply_text(
            f"{data['display_symbol']} select ayyindi. Timeframe select cheyyandi:",
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        return

    if awaiting in ("p1", "p2"):
        try:
            parts = [p.strip() for p in text.split(",", 1)]
            if len(parts) != 2:
                raise ValueError("PRICE, DD-MM-YYYY HH:MM format use cheyyandi.")
            price = as_float(parts[0])
            stamp = parse_time(parts[1])
        except Exception as exc:
            await update.effective_message.reply_text(f"Input error: {exc}")
            return
        if awaiting == "p1":
            data["p1_price"], data["p1_time"] = price, stamp
            data["awaiting"] = "p2"
            await update.effective_message.reply_text(
                "Point 2 enter cheyyandi:\nFormat: PRICE, DD-MM-YYYY HH:MM\n"
                "Example: 25180, 25-10-2026 10:30"
            )
        else:
            if stamp <= int(data["p1_time"]):
                await update.effective_message.reply_text("Point 2 time, Point 1 kanna later undaali.")
                return
            data["p2_price"], data["p2_time"] = price, stamp
            data["awaiting"] = None
            keyboard = [[InlineKeyboardButton(label, callback_data=f"condition:{key}")] for key, label in CONDITIONS.items()]
            await update.effective_message.reply_text("Alert condition select cheyyandi:", reply_markup=InlineKeyboardMarkup(keyboard))
        return


async def post_init(app: Application) -> None:
    hub = MarketData(app)
    app.bot_data["hub"] = hub
    await hub.start()


async def post_shutdown(app: Application) -> None:
    hub = app.bot_data.get("hub")
    if hub:
        await hub.stop()


def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN environment variable.")
    if not ALLOWED_IDS:
        raise SystemExit("Set TELEGRAM_ALLOWED_USER_IDS to your numeric Telegram user ID.")
    app = Application.builder().token(BOT_TOKEN).post_init(post_init).post_shutdown(post_shutdown).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("trendline", trendline_command))
    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))
    log.info("Starting Telegram polling")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
