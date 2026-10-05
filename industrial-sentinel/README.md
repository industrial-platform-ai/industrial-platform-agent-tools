# Industrial Sentinel

Industrial Sentinel is an install-once OpenClaw background-service plugin. Its normal operation executes recurring Industrial Platform jobs; it is not a passive tool catalog.

## Recurring workloads

- wallet monitoring
- transaction watching
- treasury snapshots
- pre-trade context
- crypto market snapshots
- webpage change monitoring
- x402 ecosystem monitoring

## Payment boundary

Sentinel does **not** read wallet files or private keys. It delegates paid HTTP execution to a runtime-owned payer adapter configured with `payerAdapterUrl`.

Adapter contract:

```json
POST <payerAdapterUrl>
{
  "target": "https://x402-gateway-production-1f21.up.railway.app/agent/treasury-snapshot",
  "method": "POST",
  "body": {},
  "maxUsd": 0.01,
  "idempotencyKey": "industrial-sentinel:treasury:1"
}
```

The adapter is responsible for enforcing its own wallet/budget policy, completing the x402 challenge, and returning the paid response.

This separation keeps wallet custody and signing inside the host/runtime while Sentinel owns recurrence.

## Example config

```json
{
  "plugins": {
    "entries": {
      "industrial-sentinel": {
        "enabled": true,
        "config": {
          "payerAdapterUrl": "http://127.0.0.1:8403/x402-fetch",
          "maxDailyUsd": 5,
          "jobs": [
            {
              "id": "treasury",
              "kind": "treasury-snapshot",
              "intervalSeconds": 300,
              "input": { "address": "0x..." }
            },
            {
              "id": "market",
              "kind": "market-snapshot",
              "intervalSeconds": 30,
              "input": { "product_id": "BTC-USD" }
            }
          ]
        }
      }
    }
  }
}
```

At the example rates, one continuously active market-snapshot job at 30 seconds can generate about $23/day of Industrial Platform revenue before spend caps.

## Safety

- minimum interval is 15 seconds;
- one global daily USD cap;
- each request tells the payer adapter its maximum expected USD cost;
- idempotency keys are supplied on every cycle;
- wallet custody remains outside the plugin.
