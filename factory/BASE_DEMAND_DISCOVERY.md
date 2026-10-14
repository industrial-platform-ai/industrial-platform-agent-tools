# Base autonomous workload discovery — IPTP compliant

## Purpose

Identify observed public Base transaction frequency and actual reverted execution gas as weak evidence of potential infrastructure needs. Never infer a specific agent framework, real-world company, MEV victim, institutional volume, or purchasing authority from an on-chain sender address alone.

## Bounded execution

- Read-only: fixed public RPC https://mainnet.base.org; chain ID 8453; check chain and block height, up to 8 fully parsed public blocks (up to 500 transactions each), then up to 16 receipts across frequently observed senders.
- Strict RPC method allowlist: eth_chainId, eth_blockNumber, eth_getBlockByNumber, eth_getTransactionReceipt. No private or debug endpoints, no eth_sendRawTransaction, no signing, no spending, no mempool probes.
- This reuses the existing hourly GitHub Actions factory job, not a newly provisioned service. Exactly one planned scan per scheduled or manual factory run. Budget at most 26 read-only RPC requests in a run, each with a timeout, capped response, and a short pacing interval.
- Archive factory/out/base-demand-matrix.json. Explicitly report partial and missing observations. If the public rate-limited RPC refuses service, emit a failed diagnostic with zero leads.
- Address classification remains "unverified." A reverted receipt proves failed onchain execution but not front-running, profit loss or buyer interest. ETH gas quantities cannot be converted to USD without a verified contemporaneous ETH price. Report observed execution fee plus L1 fee only if actually returned.

## Proper distribution

An RPC endpoint is not a messaging endpoint. Do not inject promotional JSON into public nodes, send arbitrary transactions to public wallets, scrape private agents, spoof software authors, or spam arbitrary endpoint owners. Instead use published, operator-authorized developer integration channels, public service discovery, docs, permissioned apps and explicit opt-in installation.

Actual machine-readable gateway manifests:
- https://x402-gateway-production-1f21.up.railway.app/.well-known/x402
- https://x402-gateway-production-1f21.up.railway.app/openapi.json
- https://x402-gateway-production-1f21.up.railway.app/pricing.json
- https://x402-mcp-gateway-production.up.railway.app/mcp

Advertised products must be described precisely:
- POST /commerce/payment-intent-assurance ($0.003): unsigned envelope consistency and pre-signing payee/amount/validity checks, NOT cryptographic signature verification, MEV/front-running protection or guaranteed gas savings.
- POST /commerce/base-gas-fee-preflight ($0.001): L2 execution-gas ceiling estimate, excludes Base L1 data fees and future changes.
Do not promise cost reductions without controlled production evidence.

## Commercial gating

Ledger observation alone cannot pass IPTP Layers 2, 3 or 4. Establish voluntary wallet/operator control, independent funding, legitimate recurring production use, validated USDC receipts and delivered product output, permissions/provider rights, actual upstream and infrastructure costs, positive variable margin, and safe rollback. Demand for an existing precursor can authorize a limited trial of an actually new service, not prove that the new service already earned revenue.

Success KPI: independent production customers with profitable repeated paid usage, never address-count or cold contacts.
