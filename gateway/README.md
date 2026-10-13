# Industrial Platform x402 gateway

Industrial Platform sells independently authorized agent tasks through a direct Base USDC x402 gateway and a Streamable HTTP MCP gateway. This is a live paid-service origin, not an Apify payment-header proxy. The routes and pricing are defined by the running gateway; do not infer eligibility or pricing from older marketing documents.

## Canonical entrypoints

- Gateway: https://x402-gateway-production-1f21.up.railway.app
- MCP: https://x402-mcp-gateway-production.up.railway.app/mcp
- HTTP discovery: `/.well-known/x402`, `/openapi.json`, `/pricing.json`, `/.well-known/agent.json`, `/llms.txt`
- Public liveness: `GET /health`
- AIMarket federation adapter: `/.well-known/ai-market.json`, `/ai-market/v2/health`, `/ai-market/v2/manifest`, `/ai-market/v2/search`, and `POST /ai-market/v2/invoke` (the federation invoke currently returns only its published free Sentinel install bundle, **not** a paid agent-service router)

## Useful paid task families

- Web intelligence: `POST /metadata`, `POST /web/markdown`, `POST /change`
- Agent operations: `POST /agent/pretrade`, `POST /agent/treasury-snapshot`, `POST /agent/transaction-watch`
- Chain data: `/chain/*`, `/crypto/*`
- Payment diagnostics / procurement / verification: `/commerce/*`; the commerce family currently contains read-only, non-signing tools. See [commerce program](./docs/commerce-program.md).

Use the **live** OpenAPI document for the exact method, schema, route availability and price. x402 clients receive payment terms from the gateway's HTTP 402 response. A separate, funded buyer wallet must authorize each paid invocation subject to its operator's spending policy. No runtime may bypass that authorization.

## Payee and provenance

The current production seller is configured for Base USDC. The canonical payee is supplied by the live payment challenge, not historic README snippets or old deployment notes. The seller must independently confirm that the payee is the correct Base USDC receiving address in Coinbase. Do not send tokens over other networks to an unverified Coinbase address.

An HTTP 402 challenge is **not** a sale. A log settlement is not automatically independent production revenue. Qualify a sale using the matching authorized payment, USDC receipt, paid HTTP 2xx, unrelated buyer, real production purpose, and cost records. Exclude verifier, testing, self-funded and circular purchases from customer-revenue milestones.

## Running and checking

```bash
cd gateway
npm run check
npm start
```

Keep AI inference disabled unless commercial model-provider permissions, pre-funded upstream capacity and positive per-request contribution are proven. Avoid exposing payment-signing credentials in code, public docs or observability logs.
