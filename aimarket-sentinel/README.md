# Industrial Sentinel AIMarket Federation Hub

A protocol-native AIMarket/ModelMarket peer hub whose local catalogue contains free, executable Sentinel bootstrap capabilities.

The bootstrap capability is intentionally free. Its job is discovery and authorized installation. Genuine paid activity begins only after the external operator deploys Sentinel with their own funded Base wallet; the runtime then settles recurring x402 calls against Industrial Platform.

## Local capabilities

- `industrial.sentinel.install@v1`
- `industrial.sentinel.wallet-monitor-bootstrap@v1`
- `industrial.sentinel.treasury-monitor-bootstrap@v1`
- `industrial.sentinel.transaction-watch-bootstrap@v1`

Each invocation returns the same machine-readable install bundle so federation assay and consumer agents can execute the capability without a separate human integration step.

## Required deployment settings

Use persistent storage for:

- `AIMARKET_DB_PATH=/data/hub.db`
- `AIMARKET_SIGNING_KEY_PATH=/data/hub_signing_key`

The signing key must survive redeploys; changing it after federation admission makes the peer appear to have changed identity.

Set `AIMARKET_HUB_URL` to the public HTTPS service URL and `AIMARKET_SKIP_SEED=1`.
