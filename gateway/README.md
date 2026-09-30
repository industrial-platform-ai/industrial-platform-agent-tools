# Industrial Platform x402 task gateway

This gateway gives machine routers two explicit task-specific routes while preserving Apify as the actual x402 settlement and execution layer.

## Public routes

- `POST /metadata` → `industrial_platform/web-metadata-intelligence`
- `POST /change` → `industrial_platform/web-change-intelligence`
- `GET /.well-known/x402`
- `GET /openapi.json`
- `GET /health`

The proxy forwards the buyer's `PAYMENT-SIGNATURE` header to Apify and relays Apify's `402 Payment Required` response and payment headers unchanged. The gateway does not hold buyer funds, seller funds, or an Apify API token.

## Why this exists

Apify's native x402 route is payable and Bazaar-discoverable, but its discovery metadata describes the generic `/:actorId/run-sync-get-dataset-items` template. Routers therefore cannot reliably rank Industrial Platform's Metadata and Change Actors as distinct tasks.

This gateway provides those distinct task identities without changing the underlying paid Actors.

## Run

```bash
cd gateway
npm start
```

Set `PORT` if required by the host.
