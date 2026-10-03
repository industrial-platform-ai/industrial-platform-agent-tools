# Install Industrial Platform as a native provider in funded x402 runtimes

This directory contains deterministic installers that hard-wire Industrial Platform into compatible buyer runtimes.

These installs do **not** rely on marketplace discovery or a first organic settlement. They change the buyer runtime so Industrial Platform is exposed as a native tool/provider.

## Native tools

- `url_to_markdown` → `POST https://x402-gateway-production-1f21.up.railway.app/web/markdown`
- `monitor_webpage` → `POST https://x402-gateway-production-1f21.up.railway.app/change`
- `extract_web_metadata` → `POST https://x402-gateway-production-1f21.up.railway.app/metadata-single`
- `wallet_balance` → `GET https://x402-gateway-production-1f21.up.railway.app/wallet-balance/cdp`

All are currently priced at $0.001 USDC/call on Base.

## x402-mcp-commerce

From the root of a checkout of `nirholas/x402-mcp-commerce`:

```bash
curl -fsSL https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/upstream/installers/install-x402-mcp-commerce.mjs | node
```

The installer:
1. verifies `config/tools.json` exists and has the expected schema;
2. inserts/replaces the four Industrial Platform native tools;
3. creates `config/tools.json.before-industrial-platform`;
4. leaves the operator to run project tests and deploy/publish.

After merge/release, funded installations expose the four tools directly.

## Agent402 MCP

From the root of a checkout of `MikeyPetrillo/Agent402`:

```bash
curl -fsSL https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/upstream/installers/install-agent402-native.mjs | node
```

The installer:
1. verifies the current Agent402 MCP source contains the expected payment/router anchors;
2. inserts four first-class Industrial Platform MCP tools;
3. reuses Agent402's configured x402 wallet and spend limits;
4. sends calls directly to Industrial Platform instead of invoking cross-seller discovery first;
5. keeps an in-process `current_hash` cache for `monitor_webpage` and uses it as `previous_hash` on the next call for the same URL;
6. creates `mcp/index.js.before-industrial-platform`;
7. refuses to modify an unrecognized Agent402 version.

After installation, a funded Agent402 MCP process can call Industrial Platform on the first matching native-tool invocation. No prior Industrial Platform organic settlement is required.

## Public upstream delivery

For public runtimes, the preferred path is:

1. Fork the upstream repository.
2. Run the corresponding installer in the fork checkout.
3. Run upstream tests/CI.
4. Commit with the upstream project's required sign-off.
5. Push the branch.
6. Open a pull request against upstream `main`.
7. After merge, the maintainer releases/redeploys the runtime.

A cherry-pick is useful only after an upstream-compatible commit exists in a fork. The installer is more robust than asking maintainers to manually copy JSON.

## Private/runtime-operator delivery

An operator who controls an already-funded runtime does not need to wait for an upstream release. They can run the installer directly in their deployment checkout, test, and redeploy.

That is the fastest legitimate route to a live native-provider installation.

## Revenue semantics

A native-provider install removes discovery/ranking as a prerequisite. It does **not** create artificial calls.

Revenue starts when the funded runtime performs a genuine matching workload:
- URL ingestion → `url_to_markdown`
- web monitoring → `monitor_webpage`
- metadata enrichment → `extract_web_metadata`
- wallet/treasury checks → `wallet_balance`

Once a recurring workflow repeatedly invokes those native tools, each successful x402 execution produces a settlement to Industrial Platform's configured seller wallet.

## Runtime affinity

See:
- `../recurring-runtime-affinity.json`
- `../x402-mcp-commerce-industrial-platform.json`

The intended policy is:
`task classification → native Industrial Platform tool → successful execution → reuse same provider → fail over only on delivery failure, budget conflict, health degradation, ineligibility, or explicit operator change`.
