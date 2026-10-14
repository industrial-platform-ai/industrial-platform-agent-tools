# Industrial Platform — Demand-Validated Single-Run Batch Factory

## What was built

One shared gateway can register multiple *reviewed, independently attested, genuinely differentiated* x402 product recipes from a **single versioned manifest**. One merged manifest change rolls into the current HTTP and MCP Railway gateway deployments; it does not create one container or recurring scheduler per service.

The candidate generator represents **up to 1,073,741,824 virtual slots** and can examine 1,000,000 in one manual GitHub Actions run while materializing at most 10,000 proposals. Candidates are identified by *semantic output contract + source handlers + price*, then deduplicated before assessment. Existing library today contains THREE reviewed execution recipes, so a million virtual slots still deduplicate to **three potential distinct products**, not a million working services. Expanding to hundreds/thousands of live services requires independently audited additional genuinely unique handler recipes and real paying demand.

Current active manifest: gateway/factory-batch-active.json. This file is empty by default. The two already-live Base USDC preflight products and other existing payable routes are unchanged.

## Manual run

GitHub Actions: "Industrial Platform Bounded Hourly Factory" -> "Run workflow".
Optional virtual_slots (default 1000000, max 1073741824), sample_limit (default 4096, max 10000). Each run executes:
- tests for known handlers and deterministic virtual replication;
- batch-run planner that samples candidate definitions, removes semantic duplicates, reads trusted evidence if supplied, calculates quota and writes factory/out/batch-plan.json;
- existing independent gateway demand audit;
- four bounded virtual replication-shard tests and archived artifact samples.

Equivalent repository-root command:

    node factory/batch-run.mjs --virtual-slots=1000000 --sample=4096

With no externally attested evidence and no configured verifier key, **zero** proposals pass. This is intentional. The CLI does not touch a wallet, probe a third-party endpoint, deploy Railway, or modify a production route.

## Quality, evidence and economics

Activation requires a separately configured Ed25519 verification key pinned as FACTORY_ATTESTOR_ED25519_PUBLIC_KEY_PEM_B64. The corresponding private signing key **must be held by an independent, operator-authorized reconciliation pipeline** with access to trusted gateway paid-execution events, validated Base USDC receipt hashes, independent payer attribution, delivered HTTP 2xx results, genuine customer use cases, actual upstream variable costs, provider permissions and reliability/QA measurements. The factory cannot mint evidence or make a signing key on its own.

Candidate attestations sign canonical JSON with:
- candidate_id, source_routes_digest and recipe_fingerprint (prevents substitution);
- kind=candidate, version=1, observed_at (freshness under 24h for new promotion);
- network=eip155:8453 and actual seller pay_to 0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E;
- evidence_pipeline=independent_gateway_chain_delivery_reconciliation;
- independently reconciled settled_successful_calls, transaction_receipts_reconciled, independent_payers, repeat_utc_days;
- real_production_purpose_verified and non_circular_payment_verified;
- product_quality_checked, provider_rights_confirmed, verified_operator_permission;
- measured_variable_cost_atomic, price_atomic, success_ppm and delivery_errors.

Must have at least **two qualifying paid uses across two UTC days**, at least one truly external customer, actual receipt/HTTP/delivery reconciliation, >=99% reliability, no unresolved delivery errors, and >=25% variable contribution margin. This is a conservative launch gate, not a warranty of demand or profitability. Unlike unsigned gateway dashboard counts, a signed record cannot be changed unnoticed. **The external verifier still must be trustworthy**: a signature authenticates its claims but does not independently prove those underlying claims. There is no configured production attestor yet, so do not claim automatic promotions are ready.

Daily/weekly promotion history is preserved in the active manifest and counted on every run. Bootstrap quota: 1 promotion/hour, 3/day, 12/week. Only a second, *signed* independent portfolio attestation can increase the throughput toward 12, 64, 256 or 1024 per run, subject to increasing observed genuine recurring customers, paid calls, reliability, margin and the manifest's 10,000-active limit. An unsigned traffic spike, benchmark, crawler, audit, verifier-bot payment, walletless 402 or competitor price is NOT a promotion trigger.

## Activation and rollback contract

1. Generate a plan with a freshly attested evidence file in a **trusted local or CI-controlled** environment:
    
       node factory/batch-run.mjs --evidence=/secure/attested-candidates.json --portfolio=/secure/portfolio-proof.json

2. Independently inspect factory/out/batch-plan.json, confirm the attestor and cost ledger, test each handler against allowed representative inputs, verify upstream rights and check projected capacity. Avoid any external spending during QA without authorization.
3. When legitimate attested proposals exist, run from a trusted checked-out repository with explicit operator approval:

       FACTORY_APPROVED_ACTIVATION=true FACTORY_ATTESTOR_ED25519_PUBLIC_KEY_PEM_B64="<public-key-base64>" \
         node factory/batch-run.mjs --evidence=/secure/attested-candidates.json --publish

   This **stages** the signed activation entries atomically in gateway/factory-batch-active.json but does not deploy.
4. Open and review a GitHub PR containing only the signed manifest changes and necessary vetted handler recipes, pass existing HTTP/MCP gateway checks, merge into main and deploy the normal two existing Railway services. All validated recipes are registered in the existing x402 route map, OpenAPI manifest and MCP tool set from one shared runtime. No per-service Railway instances.
5. Observe real paid delivery, error rates and incremental costs. For rollback, revert the active-manifest commit, rerun CI and redeploy both gateways. Existing direct routes remain untouched.

Both HTTP and MCP runtimes reject a nonempty activation manifest without a valid configured verifier key and matching attested evidence at startup. The empty manifest requires no secrets.

## Limitations and economic reality

- The virtual model reaches a billion **identifiers**, not a billion distinct products.
- No new service is automatically published while genuine source-demand proof, cost accounting, authorization, and signing infrastructure are absent.
- We do not dynamically reconfigure x402 prices per request. Every activated recipe has a fixed reviewed USD/USDC price, compatible with the existing middleware.
- Gateway memory, startup time, route count and discovery payload size scale with **activated** products even if Railway container count stays at two. Thousands require stress tests, paging/indexing where needed, data-plane quotas, and measured production capacity.
- Signature trust, chain receipts, settlement success, independent production intent and margin must be verified outside the planner and correctly attested.
- If any required check fails, the batch output is a report, not a deployment.
- Current per-activation handler set is still three vetted products; further products require unique functionality, documentation and tests, not an arbitrary path alias.
