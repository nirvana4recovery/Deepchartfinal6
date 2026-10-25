# DeepCharts Python Trendline Bots

This folder contains two separate programs:

- `bot.py`: companion that reads existing saved alerts from the DeepCharts API.
- `telegram_trendline_bot.py`: Telegram-first wizard using Bybit public market data for crypto and Kotak Neo SFeed + historical data for Indian stocks/indexes.

## Telegram trendline bot

Python 3.10+ required. Install packages:

```bash
python -m pip install -r requirements.txt
```

Create a Telegram bot using @BotFather and configure these environment variables before starting:

- `TELEGRAM_BOT_TOKEN`: token from BotFather.
- `TELEGRAM_ALLOWED_USER_IDS`: your numeric Telegram user ID. This is required; other users are denied.
- `BYBIT_CATEGORY`: `linear` (default) or `spot`.
- Kotak Neo: `KOTAK_CONSUMER_KEY`, `KOTAK_MOBILE_NUMBER`, `KOTAK_UCC`, `KOTAK_MPIN`, and `KOTAK_TOTP_SECRET`. The TOTP secret lets the bot generate fresh 2FA codes; do not use a short-lived one-time code for a long-running service.

Run:

```bash
python telegram_trendline_bot.py
```

In Telegram, send `/trendline`:

1. Choose Bybit Crypto or Kotak Neo India.
2. Enter a Bybit symbol such as `BTCUSDT`, or a Kotak Neo symbol. For NIFTY 50 enter `NIFTY 50`; for a stock use the exact Neo segment/token such as `nse_cm|11536`.
3. Choose a timeframe. The menu lists intervals supported by that provider's historical API.
4. The bot fetches recent historical OHLC candles and displays the latest five with their timestamps in IST.
5. Enter Point 1 and Point 2 as `PRICE, DD-MM-YYYY HH:MM`, for example `25120.5, 25-10-2026 10:15`. Both point times are interpreted as India Standard Time.
6. Choose alert condition and drawing style. The default future-extending style is the ray.
7. The bot subscribes to live ticks and sends a Telegram alert when the selected condition fires.

### Market data behaviour

- Bybit: public WebSocket trade ticks and REST historical klines; no Bybit API key is required for public market data.
- Kotak Neo: official `kotakneoapi` SDK SFeed WebSocket and `historical_data` method. Live streaming requires a valid Kotak Neo account/API credentials and TOTP/MPIN authentication.
- Historical intervals are provider-specific. Bybit supports 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1D, 1W and 1M. Kotak Neo historical candles support 1m, 3m, 5m, 10m, 15m, 30m, 1h, 1D and 1W. Availability/range limits are enforced by the providers.
- Alert state is saved locally in `trendline_alerts.json`; keep this file persistent when hosting.
- This bot sends alerts only. It does not place or modify orders.
- Keep all Telegram/Kotak credentials out of GitHub. Use environment variables or a private secrets manager.

## Existing DeepCharts API companion

The separate `bot.py` reads saved trendline alerts from the DeepCharts API. Configure `API_BASE_URL` (the API server URL, not the Vercel frontend URL), and if required `APP_PIN` or `API_TOKEN`, then run `python bot.py`. See the source comments for its current limitations.
