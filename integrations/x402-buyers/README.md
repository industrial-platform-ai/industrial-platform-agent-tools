# Industrial Platform — recurring x402 buyer recipes

Production seller origin:

`https://x402-gateway-production-1f21.up.railway.app`

All examples below are intended for **unrelated external buyers**. They make one paid x402 request per workload execution. Scheduling belongs to the buyer; Industrial Platform does not poll on the buyer's behalf.

## High-frequency routes

### Wallet balance — Roundhouse-attributed
```http
GET /wallet-balance?address=0xYOUR_ADDRESS&chain=eip155%3A8453
Host: x402-gateway-production-1f21.up.railway.app
```

Price: $0.001 USDC on Base.

Response:
```json
{
  "address": "0x...",
  "balances": [
    {"symbol":"ETH","amount":0.0},
    {"symbol":"USDC","amount":1.23}
  ]
}
```

Use for treasury monitoring, agent pre-flight checks, wallet dashboards, and recurring balance polling.

### Wallet balance — Coinbase/Bazaar facilitator lane
```http
GET /wallet-balance/cdp?address=0xYOUR_ADDRESS&chain=eip155%3A8453
Host: x402-gateway-production-1f21.up.railway.app
```

Same contract and price; this alias preserves Coinbase/Bazaar facilitator attribution.

### Latest block number
```http
GET /v1/block-number?network=base
Host: x402-gateway-production-1f21.up.railway.app
```

Price: $0.001. Suitable for chain-tip polling, indexer synchronization and liveness checks.

### Crypto wallet balance
```http
GET /crypto-wallet-balance?address=0xYOUR_ADDRESS&network=base
Host: x402-gateway-production-1f21.up.railway.app
```

Price: $0.001. Supports optional ERC-20 contract lists.

### Web change detection
```http
POST /change
Content-Type: application/json

{"url":"https://example.com","previous_hash":"OPTIONAL_SHA256"}
```

Price: $0.001. Designed for scheduled price, inventory, documentation, policy and competitor monitoring.

### URL to Markdown
```http
POST /web/markdown
Content-Type: application/json

{"url":"https://example.com"}
```

Price: $0.001. Designed for recurring crawl/RAG ingestion pipelines.

## Generic recurring loop

Any x402-v2-capable client can use these routes. The buyer should:

1. Send the ordinary HTTP request.
2. Receive the standard `402 Payment Required` challenge.
3. Sign the Base USDC x402 authorization.
4. Retry with the payment credential.
5. Schedule the same operation at the workload's natural cadence.

Example workload economics:

- 1 wallet every minute: 1,440 paid calls/day = $1.44/day seller revenue.
- 100 monitored URLs hourly: 2,400 paid calls/day = $2.40/day.
- 5,000 crawl URLs/day through `/web/markdown`: 5,000 paid calls/day = $5/day.

The value is mechanical after integration: each scheduled workload execution creates another paid request.

## Discovery

Machine-readable discovery is available at:

- `/.well-known/x402`
- `/openapi.json`
- `/.well-known/agent.json`
- `/llms.txt`

Agent402 currently marks the seller routable and dispatch-eligible; buyers can also resolve routes through Agent402's public route API.
