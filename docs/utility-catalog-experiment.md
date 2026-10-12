# Utility-first x402 catalog experiment (20 slots)

Status: proposed catalog, NOT published routes. Do not advertise an item as live until gateway implementation, response validation, x402 settlement, and documented upstream rights pass. Existing routes should be reused where available; never multiply equivalent URLs to induce audits.

## Acceptance gate for each catalog item
1. Distinct useful input/output and user workload; reproducible response test.
2. Exact Base USDC payee: 0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E; pricing accurately documented.
3. HTTP 402 challenge, authorized payment retry, HTTP 2xx and matched settlement receipt; no self-funded verification as revenue.
4. Rate limits, timeouts, privacy policy, and upstream commercial rights.
5. Evidence of independently funded production use before expanding that family.

## Candidate slots (all unverified until tested)
- Wallet: native balance; ERC-20 balance; token transfer history; allowance inspection; allowance change detection.
- Treasury: multi-wallet snapshot; daily balance delta; incoming transfer alert; outgoing transfer alert; reconciliation status.
- Chain: block height; transaction status; transaction receipt; gas estimate; contract metadata.
- Web: URL markdown extraction; URL metadata; content hash; change detection; structured article extraction.

## Workstream experiments
- Discovery: canonical /.well-known/agent.json, pricing.json, llms.txt and OpenAPI accuracy. Acceptance: valid documents with live URLs and no false claims.
- Agent integration: read-only MCP tool descriptions and example authorized x402 retry. Acceptance: client can call one existing paid route with its own approved wallet.
- Conversion: group 402 -> authorized retry -> 2xx -> settled by endpoint and external payer. Acceptance: matched on-chain receipt and production intent.
- Retention: explicit opt-in balance/change polling. Acceptance: repeat usage across UTC days by same unrelated customer.
- Inference: upstream rights, cost per token, funded quota and positive margin before listing. Acceptance: documented provider permission and positive unit economics.

## Rollout and measurement
Phase 1: test at most 20 distinct capabilities; do not claim they are deployed. Phase 2: expand only proven families, first to 100, then 1000 based on independent repeat paid usage and positive contribution. End channels after 10 qualified approaches or 7 days without conversion. Never trigger crawlers to manufacture payment volume, bypass permissions, or turn read-only monitoring into purchasing.

Hourly report: action + verification; recurring production customer; independently verified rolling 24h Base USDC revenue (otherwise UNVERIFIED); independent payers; UTC-day repeat payers; paid calls by inference/Markdown/change/other; recurring jobs; revenue/buyer; gross settlements vs wallet receipts vs revenue; actual hosting/upstream costs and contribution margin (otherwise unavailable).
