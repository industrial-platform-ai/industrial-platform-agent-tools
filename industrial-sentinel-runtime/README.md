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


## x402 Revenue Guard

For an operator who sells x402 services, Revenue Guard monitors the seller wallet incrementally and alerts on new incoming monitored payments or when expected revenue goes stale.

```
SENTINEL_REVENUE_GUARD_MODE=1
SENTINEL_MONITOR_ADDRESS=<operator seller wallet>
SENTINEL_REVENUE_STALE_SECONDS=3600
SENTINEL_REVENUE_GUARD_INTERVAL_SECONDS=5400
SENTINEL_ALERT_WEBHOOK_URL=https://operator.example/alerts
SENTINEL_EVM_PRIVATE_KEY=<operator-owned payer secret>
```

Defaults:
- wallet-monitor every 90 minutes by default;
- hard spend cap of $0.10/day;
- incremental cursor/state carried forward automatically;
- incoming-payment alerts;
- revenue-stale alert after 1 hour by default (configurable).

At the current $0.005 wallet-monitor price, 16 checks/day cost about $0.08/day. This mode is intended for operators whose payment flow is valuable enough that detecting a settlement outage or missed deposits is worth more than the monitoring cost.
