# Paid Delivery Evidence — Correlation and Qualification

Purpose: distinguish genuine recurring third-party productive use from discovery/health checks, internal runtime payments, unverified receipts, and chance temporal coincidences. The current factory does **not** have an independently controlled attestor private key and must not self-sign claims.

## What new production logs will contain

Only on paid POST/GET HTTP 2xx responses where the x402 middleware emitted a successful settlement response with a Base transaction hash, the gateway writes:

    X402_PAID_DELIVERY {"event_type":"x402_paid_delivery_response","method":"POST","path":"/...","http_status":200,"transaction":"0x...","payer":"0x...","network":"eip155:8453","claimed_amount_atomic_usdc":"...","payment_response_header_seen":true,"paid_http_2xx_observed":true,"chain_receipt_verified":false,"funds_to_correct_payee_verified":false,"independently_funded_verified":false,"production_purpose_verified":false,"incremental_cost_verified":false,"externally_earned_revenue_verified":false,"observed_at":"..."}

Never log PAYMENT-SIGNATURE, EIP-712 signatures, seed phrases, caller API keys, raw request bodies or the full PAYMENT-RESPONSE envelope. Missing/malformed/non-Base settlement responses, errors, unpaid 402s and unsuccessful deliveries do not yield such events. This is telemetry only, not an activation token.

## Strict reconciliation before promoting a candidate

1. Start with the unique pair (network, transaction). Require a matching X402_SETTLED or ALT_BAZAAR_SETTLED event plus X402_PAID_DELIVERY containing the exact same transaction, payer, amount where reported, and successful endpoint path. Never join by a seconds-wide timestamp alone.
2. Fetch the Base transaction receipt from an independently controlled chain RPC and verify successful execution and the exact USDC contract Transfer event to the currently authorized Industrial Platform payee. Deduplicate repeated log writes by transaction and transfer log index, including batch settlement cases.
3. Exclude internal buyer, same-operator, platform-controlled runtimes, refunded/reimbursed, friend-funded, bounty, synthetic, test and verification-only agents. An unfamiliar payer address is **unknown**, not production, until ownership and legitimate independent workload can be established.
4. Require repeat production use over more than one UTC day, actual functioning output and observed incremental costs, not merely a 200 response or payment.
5. The independent attestor can then sign a versioned, candidate-scoped evidence payload with a separately controlled Ed25519 key. The gateway/factory holds only the attestor's public verification key. A signature is evidence of the attestor's assessment, not proof the assessment was correct. A provenance review is required before trusting the signer.
6. If any element cannot be established, output a **nonqualifying audit record** with the missing field. Do not mint a signed passing attestation.

## Concrete finding: Oct 14, 2026 UTC

Ten $0.005 x402 settlement logs from wallet 0x025e19a5c2db2c6ae789ef0bbc85a3ccde6e9576 appeared from 00:01 to 00:19 UTC. Nine had corresponding successful POST /agent/wallet-monitor records labeled Industrial-Sentinel-Runtime/0.1 within zero to two milliseconds of the gateway settlement timestamps. This is strong circumstantial evidence of Industrial Platform-related runtime use, **not** proof of independent external commercial demand. The tenth lacked a nearby successful HTTP record in the retrieved sample. None may qualify the factory absent a trusted identity/ownership audit. At this time, older events cannot be deterministically attributed by transaction to an HTTP path because historical gateway flow logs lack the transaction hash; the new event addresses that traceability gap for future calls.

## Freeze-free commercial goal

This instrumentation creates zero new services, triggers zero paid probes, authorizes no spending, and does not modify x402 settlement behavior. It enables ledger-grade reconciliation after a genuine independent agent chooses to pay for an existing service. The future external attestor must be implemented in a separate trusted reconciliation environment; do not grant the production gateway a private attestation key.
