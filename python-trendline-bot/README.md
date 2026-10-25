# DeepCharts Python Trendline Bot

A standalone Python companion for nirvana4recovery/Deepchartfinal6. It reads saved drawing-alert anchors from the API and evaluates live tick WebSocket messages using the same line projection and core trigger rules as artifacts/api-server/src/services/AlertEngine.ts.

## What it does

- Reads anchor points from GET /api/trendlines: point1Price, point1Time, point2Price, point2Time.
- Projects line price using the market tick timestamp, matching the server.
- Supports break, breakout, cross_above, cross_below, touch, touch_price, retest, rejection, above_price, below_price, enter_zone, and exit_zone.
- Sends Telegram messages when the saved alert has telegramEnabled=true. Without Telegram credentials, alerts print to the terminal.
- Reconnects to WebSocket and polls the API for changes.
- Does not place trades or write to the DeepCharts database.

## Setup

Python 3.10+ required.

1. Install dependencies from this folder: python -m pip install -r requirements.txt
2. Set API_BASE_URL to the public base URL of the DeepCharts API server (not the Vercel frontend URL).
3. If API PIN protection is enabled, set APP_PIN to the app PIN, or set API_TOKEN to a valid token previously issued by /api/auth/verify-pin.
4. Optionally set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. If omitted, alerts print to the terminal.
5. Run: python bot.py

Example environment values:
- API_BASE_URL=https://YOUR-API-SERVICE.up.railway.app
- APP_PIN=YOUR_APP_PIN
- TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID=YOUR_CHAT_ID

Do not commit real PINs, API tokens, or Telegram credentials to GitHub.

## Important notes

- Create a drawing alert in the DeepCharts UI first; ordinary chart drawings alone are not saved to /api/trendlines.
- This is a second evaluator. The API server AlertEngine may also trigger the same alert and send its own Telegram message. To avoid duplicate Telegram messages, disable Telegram delivery on the corresponding DeepCharts alert; this bot has its own BOT_SEND_TELEGRAM toggle and can still send independently.
- Rectangle alerts are zone alerts and are skipped. ATR proximity is skipped because exact parity requires the API server's candle-history state.
- The API server must be running and its live market feed must provide ticks for the alert symbols. This is an alert tool, not an order-execution bot.
