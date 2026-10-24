# Kotak Neo SFeed bridge for DeepChartsFinal6

This sidecar uses Kotak Neo's official `kotakneoapi` Python SDK (SFeed / native_batch protocol) so the app does not need to implement Kotak's binary market-data decoder in TypeScript.

## Environment variables

Set these on the **sidecar service**, never in frontend code:

- `KOTAK_NEO_CONSUMER_KEY` — Neo Trade API consumer key
- `KOTAK_NEO_MOBILE` — registered mobile number in the format accepted by Neo
- `KOTAK_NEO_UCC` — client/UCC code
- `KOTAK_NEO_MPIN` — MPIN used by Neo API
- `KOTAK_NEO_TOTP_SECRET` — TOTP secret from your own Neo API setup (not a current one-time code)
- `KOTAK_NEO_BRIDGE_TOKEN` — long random shared secret, same value on the sidecar and Node API service
- `KOTAK_NEO_OPTION_CONTRACTS` — optional JSON array of option contracts, for example:
  `[{"token":"YOUR_NSE_FO_TOKEN","symbol":"NIFTY26OCT25000CE","exchangeSegment":"nse_fo"},{"token":"YOUR_OTHER_TOKEN","symbol":"NIFTY26OCT25000PE","exchangeSegment":"nse_fo"}]`

Do not use the example placeholders as actual instrument tokens. Use current tokens from Kotak Neo's instrument/scrip master; tokens change by expiry/contract.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080
```

The sidecar exposes `/health` and an authenticated WebSocket at `/stream?token=...`. Deploy it as a separate private Railway service (or another Python host). Restrict public access if your host supports private networking.

## Connect the Node API

On the DeepCharts API service set:

- `KOTAK_NEO_BRIDGE_URL=wss://YOUR-SIDECAR-HOST/stream`
- `KOTAK_NEO_BRIDGE_TOKEN` — same shared secret as sidecar
- Optionally `KOTAK_NEO_OPTION_CONTRACTS` with the same JSON array to seed option subscriptions.

After deployment, `GET /api/market/kotak-neo/status` reports feed status. Subscribe/unsubscribe contracts through `POST /api/market/kotak-neo/options/subscribe` and `POST /api/market/kotak-neo/options/unsubscribe` (these routes are behind the app's existing PIN verification).

## Data behavior and safety

- Index stream uses Kotak Neo SFeed's index subscription for Nifty 50.
- Options use NSE F&O instrument tokens and the SFeed touch-line subscription.
- Normalized ticks enter DeepCharts' existing market-data/candle/alert pipeline under provider `kotakneo`.
- This is market-data only. It does not place orders.
- Verify current Neo API eligibility, authentication, exchange segment names, and token values before enabling live data. No live market connection can be validated without your account's credentials and a deployed sidecar.
