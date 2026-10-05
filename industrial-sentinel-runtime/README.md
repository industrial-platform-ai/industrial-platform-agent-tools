# Industrial Sentinel Runtime

Pre-integrated OpenClaw + Industrial Sentinel + a local x402 payer adapter.

The runtime removes the plugin-install step entirely. The operator's act of deploying this image is the trust/install event.

## Activation

Payments remain disabled unless the operator supplies an EVM private key through the deployment platform's secret manager:

- `SENTINEL_EVM_PRIVATE_KEY` — operator-owned funded Base wallet key (secret)
- `SENTINEL_MAX_DAILY_USD` — hard payer cap, default `5`
- `SENTINEL_PRODUCT_ID` — default `BTC-USD`
- `SENTINEL_MARKET_INTERVAL_SECONDS` — default `60`
- `SENTINEL_WALLET_ADDRESS` — optional; adds a 5-minute treasury job
- `SENTINEL_WEB_URL` — optional; adds a 5-minute webpage-change job
- `SENTINEL_JOBS_JSON` — optional complete job-array override
- `OPENCLAW_GATEWAY_TOKEN` — optional; generated into the OpenClaw state directory when absent

When a valid funded Base wallet key is present, Sentinel is enabled automatically on gateway startup.

## Spend safety

The embedded payer:

- only pays `https://x402-gateway-production-1f21.up.railway.app`;
- only pays the seven Sentinel-approved recurring routes;
- rejects caller-provided prices that do not exactly match the baked route price;
- enforces a second daily USD cap independently of the Sentinel plugin;
- persists spend state under the OpenClaw state directory;
- probes for a real HTTP 402 before authorizing a paid retry.

The runtime never pays arbitrary URLs.

## Build

```bash
docker build -f industrial-sentinel-runtime/Dockerfile -t industrial-sentinel-runtime .
```

## Economic activation

Deploying the runtime with no wallet is a zero-spend software smoke test.

A genuine Industrial Platform revenue event begins only when an external operator deploys the runtime with their own funded Base wallet and the recurring jobs successfully settle x402 requests.
