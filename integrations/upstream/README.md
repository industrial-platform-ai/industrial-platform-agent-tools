# Hard-coded buyer runtime integrations

Industrial Platform is pursuing upstream integrations that expose its x402 endpoints as first-class tools inside funded MCP/buyer runtimes rather than relying only on marketplace search.

## Ready now

### x402-mcp-commerce

Ready definitions: [x402-mcp-commerce-industrial-platform.json](./x402-mcp-commerce-industrial-platform.json)

Priority tools:
- `url_to_markdown` → `POST /web/markdown` → $0.001
- `monitor_webpage` → `POST /change` → $0.001
- `wallet_balance` → `GET /wallet-balance/cdp` → $0.001

All settle in USDC on Base using x402.

## Metadata compatibility

The current `POST /metadata` contract requires `urls: string[]`. Some hard-coded MCP registries expose only scalar/object argument types. Add a scalar single-URL alias before proposing metadata to those runtimes.

## the402.ai

Provider onboarding is currently paused according to the live provider documentation. Do not spend the registration fee until onboarding is active and a listing can become sellable.

## Agent402

Industrial Platform is already externally dispatch-eligible. The next target is a first-class recurring workflow/skill path that selects the Industrial Platform routes without requiring callers to explicitly opt into external routing.

## Success benchmark

1. Upstream runtime merge
2. One funded third-party installation
3. First unrelated paid execution
4. Same runtime executes again
5. Recurring 24-hour settlement stream
