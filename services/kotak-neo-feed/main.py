"""Kotak Neo SFeed sidecar for DeepChartsFinal6.

All Neo credentials stay in this service's environment. The Node app connects
to this service over a private WebSocket and receives normalized JSON ticks.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import pyotp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from neo_api_client import NeoAPI
from neo_api_client.websocket.feed import SFeedIndex, SFeedScrip, SFeedScripLite, WsToken

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("kotak-neo-feed")
app = FastAPI(title="DeepCharts Kotak Neo SFeed bridge")


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def configured_contracts() -> list[dict[str, str]]:
    raw = os.getenv("KOTAK_NEO_OPTION_CONTRACTS", "[]")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("KOTAK_NEO_OPTION_CONTRACTS must be a JSON array") from exc
    if not isinstance(value, list):
        raise RuntimeError("KOTAK_NEO_OPTION_CONTRACTS must be a JSON array")
    result = []
    for item in value:
        if not isinstance(item, dict) or not item.get("token") or not item.get("symbol"):
            continue
        result.append({
            "token": str(item["token"]),
            "symbol": str(item["symbol"]).upper(),
            "exchangeSegment": str(item.get("exchangeSegment", "nse_fo")),
        })
    return result


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "kotak-neo-feed"}


@app.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    expected = os.getenv("KOTAK_NEO_BRIDGE_TOKEN", "").strip()
    if expected and websocket.query_params.get("token", "") != expected:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await websocket.accept()
    await websocket.send_json({"type": "status", "status": "connecting", "message": "Authenticating with Kotak Neo"})
    try:
        consumer_key = required_env("KOTAK_NEO_CONSUMER_KEY")
        mobile = required_env("KOTAK_NEO_MOBILE")
        ucc = required_env("KOTAK_NEO_UCC")
        mpin = required_env("KOTAK_NEO_MPIN")
        totp_secret = required_env("KOTAK_NEO_TOTP_SECRET")

        client = NeoAPI(consumer_key=consumer_key, environment=os.getenv("KOTAK_NEO_ENVIRONMENT", "prod"))
        # SDK login/validation are synchronous; do not block the ASGI event loop.
        await asyncio.to_thread(client.totp_login, mobile_number=mobile, ucc=ucc, totp=pyotp.TOTP(totp_secret).now())
        await asyncio.to_thread(client.totp_validate, mpin=mpin)

        async with client.create_websocket() as feed:
            await feed.subscribe_index([WsToken("nse_cm", "Nifty 50")])
            symbol_by_token = {contract["token"]: contract["symbol"] for contract in configured_contracts()}
            for contract in configured_contracts():
                await feed.subscribe_scrips([
                    WsToken(contract["exchangeSegment"], contract["token"])
                ])

            await websocket.send_json({"type": "status", "status": "connected", "message": "Kotak Neo SFeed connected"})
            feed_task = asyncio.create_task(forward_ticks(feed, websocket, symbol_by_token))
            command_task = asyncio.create_task(process_commands(feed, websocket))
            done, pending = await asyncio.wait(
                {feed_task, command_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc:
                    raise exc
    except WebSocketDisconnect:
        log.info("Node bridge disconnected")
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log.exception("Kotak Neo feed failed")
        try:
            await websocket.send_json({"type": "status", "status": "error", "message": str(exc)[:300]})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


async def forward_ticks(feed: Any, websocket: WebSocket, symbol_by_token: dict[str, str]) -> None:
    async for message in feed:
        try:
            if isinstance(message, SFeedIndex):
                price = float(message.last_traded_price or 0)
                if price > 0:
                    await websocket.send_json({
                        "type": "tick",
                        "symbol": "NIFTY50",
                        "providerSymbol": str(getattr(message, "name", None) or "Nifty 50"),
                        "price": price,
                        "volume": 1,
                        "timestamp": int(getattr(message, "last_update_time", 0) or 0) or None,
                    })
            elif isinstance(message, (SFeedScrip, SFeedScripLite)):
                price = float(getattr(message, "last_traded_price", 0) or 0)
                if price <= 0:
                    continue
                token = str(getattr(message, "instrument_token", "") or "")
                symbol = str(getattr(message, "trading_symbol", None) or symbol_by_token.get(token) or token)
                await websocket.send_json({
                    "type": "tick",
                    "symbol": symbol.upper(),
                    "providerSymbol": symbol,
                    "price": price,
                    "volume": int(getattr(message, "last_trade_qty", 0) or 1),
                    "timestamp": int(getattr(message, "last_update_time", 0) or getattr(message, "last_trade_time", 0) or 0) or None,
                })
        except WebSocketDisconnect:
            return


async def process_commands(feed: Any, websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive_json()
        if not isinstance(message, dict):
            continue
        action = message.get("type")
        contracts = message.get("contracts", [])
        if not isinstance(contracts, list):
            contracts = []
        tokens: list[WsToken] = []
        for item in contracts:
            if not isinstance(item, dict) or not item.get("token"):
                continue
            token = str(item["token"])
            tokens.append(WsToken(str(item.get("exchangeSegment", "nse_fo")), token))
            # Keep the requested display symbol even if the feed acknowledgement
            # has not resolved the exchange trading symbol yet.
            symbol = str(item.get("symbol", "")).strip().upper()
            if symbol:
                symbol_by_token[token] = symbol
        if action == "subscribe":
            if message.get("index"):
                # Index subscription is idempotent at the SDK layer.
                await feed.subscribe_index([WsToken("nse_cm", "Nifty 50")])
            if tokens:
                await feed.subscribe_scrips(tokens)
            await websocket.send_json({"type": "status", "status": "connected", "message": "Subscriptions updated"})
        elif action == "unsubscribe" and tokens:
            await feed.unsubscribe_scrips(tokens)
            await websocket.send_json({"type": "status", "status": "connected", "message": "Option subscription removed"})
