# Industrial Platform Trust Protocol (IPTP)

**Status:** Adopted as Industrial Platform's canonical governance standard.  
**Version:** 1.0  
**Scope:** All x402 HTTP and MCP services, the revenue ledger, customer qualification, autonomous factory, agent runtimes and integrations.  
**Authority:** Industrial Platform operator. Future protocol changes require explicit operator authorization and a reviewed versioned change.

## Purpose and non-negotiable separation

IPTP separates a successful transaction from the distinct claims that an operator controls a wallet, constitutes an independent customer, uses a service for a real production purpose, and creates profitable recurring demand.

**Settlement is not identity. A wallet signature is not proof of independence. Repeated paid calls are not necessarily commercial revenue. Virtual service generation is not deployment.**

No gateway or agent may convert weak evidence into a higher trust classification merely to unlock factory growth.

## Layer 1 — Payment and delivery

- Preserve standard x402 Base USDC payment semantics and all existing payable routes. A buyer may discover, pay for, and receive an authorized service without providing identity documents, completing a wallet challenge, or opting into IPTP identity verification.
- Count as *confirmed settlement* only an independent successful Base transaction receipt involving the canonical Base USDC contract (`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`) and actual seller payee (`0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E`), with amount, unique transaction/log index and no double-count.
- Count as *correlated paid delivery* only when the exact settlement transaction matches a gateway x402 settlement event and successful HTTP 2xx delivery on the correct route. Nearby timestamps or a customer-supplied receipt alone cannot establish this.
- Preserve publicly verifiable audit references without storing caller signatures, private keys, secrets, raw request bodies or unnecessary personal data.
- These proofs establish the transaction and the delivered service—not operator ownership, independent funding, or production purpose.

## Layer 2 — Voluntary cryptographic identity

- Offer a **separate, optional** EIP-4361-style or equivalent nonce-bound, domain-bound, audience-bound and expiring off-chain signature challenge for proof of current wallet control; include the full human-readable message, intended domain, chain ID, nonce, expiry and clear purpose.
- Verify the recovered signing address against the known payer. Signatures must not authorize asset transfers, allowances, smart-contract calls or delegated spending.
- A successful challenge proves control of the signing wallet at the time of verification. It does not prove the signer's legal identity, ownership of the runtime, independent financing or consent of an unrelated operator.
- Runtime linkage requires separate voluntary, authenticated evidence from the operator. Do not infer a tenant's identity from IP address, geographic location, user-agent string, public funding wallet or cloud provider.
- Do not deliver unsolicited demands, insert signing commands into agent tool outputs, require a signature before providing a paid result, or silently modify x402 payment challenges. No interception, prompt injection, or private-key requests.
- The identity-verification component must remain isolated from the payment middleware and must minimize collection, access and retention of personal information.

## Layer 3 — Independent commercial qualification

Classify every relevant event **explicitly** as one of:
1. `observed_unreconciled` — discovery, HTTP challenge, log claim or transfer not fully validated;
2. `settled_and_delivered_unattributed` — settled Base USDC and valid route delivery; independence unproven;
3. `wallet_control_verified_operator_unattributed` — voluntary signature verified but runtime/ownership/funding/purpose unproven;
4. `independent_production_customer` — independent operator and funding verified, real authorized production purpose established, with noncircular paid delivery;
5. `recurring_profitable_production` — above, repeat paid demand across distinct UTC days and measured positive incremental economics;
6. `excluded` — self/friend/reimbursed/bounty-circular/synthetic/test/verification-only payments or failed qualifying evidence.

No status may be inferred solely from the software user-agent, number of calls, IP ownership, customer self-declaration, social-media posts, factory simulation, directory listing or unsigned telemetry. Unknown payer ownership must remain **unattributed**, not auto-labeled external.

Trace funding and reimbursements where lawfully observable, avoid misidentifying token lookalikes as canonical USDC, and log remaining uncertainty. Independently signed attestations require a trustworthy auditor and reviewable source receipts—not a gateway-held attestor private key.

**Revenue KPI:** independently earned, noncircular production revenue from truly unrelated operators, net of real variable costs when contribution is reported. Maintain separate ledgers for total confirmed USDC receipts, paid delivery, unknown attribution, qualifying production revenue, and cost/margin. Never relabel or silently rewrite historic results.

## Layer 4 — Demand-validated factory activation

- The factory may generate and deduplicate virtual candidates but must never interpret virtual count as live services, customers or revenue.
- Promote a candidate only with verified functional differentiation, licensing/provider rights, safety and QA, actual independent production demand on the candidate or a documented legitimate predecessor workload, explicit cost and margin evidence, reliable operation, and safe rollback.
- A novel product cannot have pre-launch sales: predecessor-service demand may support a *trial authorization*, never a fabricated claim that the novel product already earned revenue. After a controlled launch, maintain separate product-level conversion and profitability evidence.
- Honor the signed-evidence and activation quota gates in `factory/DEMAND_VALIDATED_BATCH_FACTORY.md`. Existing code gates remain in force even if this document describes stronger future review requirements.
- The gateway and factory must not create their own qualifying demand, sign self-attestations, bypass outside-agent spending policies, or use self-funded calls to trigger expansion.

## Audit and incident policy

- Every qualification decision records which proofs were confirmed, their timestamps and sources, uncertain/contradictory facts, reviewer or independent verifier, and the permitted next classification.
- Missing, stale, conflicting or revoked evidence is an explicit denial of advancement, not evidence of guilt.
- If a trust review reveals ambiguous ownership or reimbursement, quarantine **the revenue classification and promotion decision**, not the already-authorized service delivery.
- Preserve zero-dollar discretionary acquisition spending unless the operator explicitly changes it; do not solicit paid proofs or fund agent wallets to manufacture credentials.

## Current example — Sentinel payer

Payer `0x025e19a5c2db2c6ae789ef0bbc85a3ccde6e9576` has observed real Base USDC settlements and repeated successful `/agent/wallet-monitor` execution through a client identifying as `Industrial-Sentinel-Runtime/0.1`, hosted on an IP attributed to Tencent Cloud. The cloud provider **does not verify tenant identity or independence**. This payer remains `settled_and_delivered_unattributed`, pending a voluntary wallet-control signature, independently attributable operator/workload evidence and real profitability.

Neither existing receipts nor the previously prepared challenge are evidence of a completed identity handshake. No activation entitlement is granted by this example.

## Implementation status

**Policy is adopted. Enforcement is partial, not complete.** Base USDC settlement and HTTP-delivery instrumentation exist; the production factory already requires signed evidence and remains gated. A dedicated opt-in identity service, independently controlled attestor, full cost ledger and complete automated classifications are **not yet deployed**. Do not represent this governance document as proof that those capabilities are operating.

Supporting references:
- [Paid delivery attribution](observability/PAID_DELIVERY_ATTRIBUTION.md)
- [Demand-validated batch factory](factory/DEMAND_VALIDATED_BATCH_FACTORY.md)
- [Agent operating instructions](AGENTS.md)
