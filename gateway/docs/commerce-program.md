# Industrial Platform agent-commerce program (2026-10-13)
## Deployment scope and anti-abuse guardrails
Industrial Platform is a buyer-authorized discovery, execution-support and receipt-verification layer for machine-to-machine services. No endpoint in this phase makes purchases, signs transactions, sweeps wallets, triggers audits, or creates recurring bills. Service use is charged only when a separate, independently funded x402 client authorizes the payment. Production requests remain protected by the existing gateway payment middleware. Seller payee is the configured Base recipient (currently ending 1836E).

### Commercial qualification (strict)
Qualifying production revenue requires all of: (a) independent Base USDC transfer to the correct payee; (b) matching gateway X402_SETTLED or ALT_BAZAAR_SETTLED event plus HTTP 2xx; (c) third-party production intent. Observational receipts, verifier jobs, audits, related-party transactions, tests, bounty reimbursed and artificial activities are not qualifying production revenue. Distinguish total logged gross settlement, wallet receipts, qualified revenue, direct upstream/chain costs and fixed hosting overhead. Report costs as unavailable until reconciled with invoices and per-call usage.

### Deployed phase (8 reusable x402 operations, $0.001 each)
1. `POST /commerce/payment-diagnostic`: x402 v2 challenge analysis with caller-provided payee allowlist, token, network, scheme and budget ceiling; read-only. It does **not** sign or retry a buyer transaction.
2. `POST /commerce/procurement-quote`: compare 1–25 caller-provided supplier quotes; no discovery of actual availability, no purchase or routing fee.
3. `POST /commerce/tx-outcome`: read live Base/Ethereum RPC transaction status and return terminal-state outcome.
4. `POST /commerce/allowance-delta`: read on-chain allowance and compare against caller-provided previous amount.
5. `POST /commerce/material-web-change`: one real public web check against caller-provided previous hash; charged per check (not a push subscription).
6. `POST /commerce/endpoint-health`: one explicitly operator-authorized public HEAD request, no paid-verifier triggers. Use only on endpoints the requesting operator is entitled to test.
7. `POST /commerce/usdc-receipt`: inspect official Base USDC Transfer receipt on-chain for seller payee; never claim that a transfer alone proves x402 HTTP success or real production revenue.
8. `POST /commerce/evidence-fingerprint`: timestamped SHA-256 of **caller-provided** claims. Not signed, source-fetched, or independently verified.

These operations use existing `networkTools` and `runChange`, no new infrastructure or model API costs. Available through the HTTP OpenAPI/x402 manifests and the `/mcp/commerce` profile of the existing MCP gateway after successful deployment. Existing `/agent/pretrade`, `/agent/treasury-snapshot`, `/chain/*`, `/web/*` remain the decision/data bundle baseline. Validate field behavior and 402 payment challenge before making integration claims.

### Experiment schedule and acceptance gates
**E1 – Buyer payment recovery:** diagnostic discovered through `/mcp/commerce`. Acceptance = independent funded agent uses diagnostic + completes a separately authorized x402 purchase (HTTP 2xx, Base receipt) + purchases again across another UTC day. **No automatic authorization or signing**.

**E2 – Decision products/outcomes:** transaction finality, allowance delta, web material change and pretrade context. Acceptance = actual external buyer repeats production paid calls at positive per-call contribution, quality checks return accurate data with source timestamps. No price/cost-scale claims without upstream measurements.

**E3 – Operator-paid verification:** per-request authorized public endpoint HEAD, receipt check and webpage change. Acceptance = operator explicitly requests repeated verification and independently pays for it; crawler indexing alone is not adoption. Do not re-register duplicates or touch arbitrary third-party endpoints.

7-day / 10-qualified-approach stop rule: for each experiment, record independent buyer approaches, production conversion, UTC-day repeats and costs. Terminate unproductive channel; don't create synthetic orders.

### Roadmap: staged hypotheses, not yet live features
| Rank | Mechanism | Status/gate |
|---|---|---|
| 1 | x402 payment recovery engine | Diagnostic live after deploy; transaction retry **not implemented** without buyer wallet integration |
| 2 | Autonomous decision bundles | Reuse pretrade/treasury; no new managed recurring subscription |
| 3 | Public-data transformation | Reuse existing permitted web/chain tools; rights/freshness first |
| 4 | Agent-to-agent routing | Quote comparison only; no supplier purchase/markup yet |
| 5 | Payment safety/preflight | Read-only budget and payee check, no live signer |
| 6 | Incremental intelligence | Material change per check; no push billing |
| 7 | Settlement accounting | Receipt inspection only; settlement/HTTP matching to be instrumented |
| 8 | AI inference arbitrage | Disabled unless commercial terms, funded upstream and positive margin independently verified |
| 9 | Machine-readable feeds | Use existing licensed/public data APIs, test demand |
| 10 | Task-specific output compiler | Return real distinct useful outcomes; avoid duplicate endpoint farming |
| 11 | Opt-in paid verification | Single authorized health check; subscriptions not yet implemented |
| 12 | Referral/fulfilment network | No live routed payments until merchant contract, disclosure and buyer permission |

### Mechanism assessment
- Independent third-party QA purchase: count as **verification receipts**, not production end-user demand unless the verifying entity itself is a genuine production customer.
- Contracted continuous QA: permissible when operator opted in and set payment limits; never programmatically force payment.
- Registry-triggered reverification: count only organically chosen independent checks; never manufacture update/crawl loops.
- Repeated artificial updates to provoke payments: prohibited, do not build.

### Long-term defensible flywheel
Publish *accurate* agent-native descriptions → an independently funded agent with real demand discovers one capability → explicitly authorizes a purchase → receives an accurate result/evidence with source and freshness → naturally reuses that capability for independent operational work → gateway attributes repeat revenue to correct sender and task while measuring true variable costs. Avoid circular settlements or promotional transactions.

No discretionary acquisition spending. Existing Railway hosting is measured separately when invoices are available.
