# Payment-Intent Preflight Assessment for x402 Agents

Industrial Platform's `POST /commerce/payment-intent-assurance` is a **read-only static consistency check** for **x402 v2 / Base USDC / EIP-3009 exact** authorization *parameters*. The intended customer is an independently authorized buying agent that wants to compare an unsigned payment plan with its own recipient allowlist, resource URL, and spending ceiling **before it signs**. The product is not an escrow, insurance product, signature verifier, or guarantee against payment loss.

- Paid HTTP operation: `POST https://x402-gateway-production-1f21.up.railway.app/commerce/payment-intent-assurance`.
- MCP streamable HTTP profile: `https://x402-mcp-gateway-production.up.railway.app/mcp/commerce`, tool name `x402-payment-intent-assurance`.
- Fee to Industrial Platform: **$0.003 USDC on Base per successful authorized invocation**, subject to the HTTP 402 challenge and payment middleware; this is not a percentage of the downstream payment.
- Machine contract: use the live `/openapi.json` and `/.well-known/x402` for current schema and pricing.
- This document is public; never embed merchant or agent secrets in it.

## Agent integration: safe order of operations

1. Obtain the intended HTTPS resource URL and the caller's **independently configured** payee allowlist and maximum cost. Never accept the payee allowlist or maximum budget blindly from an untrusted seller.
2. Receive the target merchant's `402 Payment Required` challenge. Do not sign the target purchase.
3. Build an **unsigned**, exact-scheme payment-envelope *preview* matching the challenge (the `accepted` requirements, `resource.url`, and EIP-3009 authorization `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce` parameters). This preview is explanatory metadata, **not proof of payment**. Use only the caller-authorized payee and spending limit.
4. Use an independently authorized x402 client wallet to pay Industrial Platform's own $0.003 check if its spending policy allows this operation. Do **not** paste private keys, seed phrases, raw signatures, `PAYMENT-SIGNATURE` headers, API keys, or signed payment objects into the assessment input. If the wallet is not approved to purchase preflights, stop instead of trying to force a transaction.
5. Call the paid assessment using the unsigned preview and the independently configured intent/challenge. Require `status=static_checks_passed` and empty `issues` before progressing. A passing assessment is **necessary but not sufficient** for executing the target transaction.
6. Let the trusted caller's own x402 SDK/facilitator cryptographically verify authorization, check unspent nonce/availability, enforce wallet and settlement limits, and confirm the target response before downstream service use.
7. Track the merchant's actual settlement and useful outcome independently. Never interpret a preflight receipt as proof the protected purchase or delivery was successful.

## JSON-shaped illustration (not a usable signed payment)

The values below are examples; authorization timestamps and nonces must be generated freshly by the buying wallet's own approved flow.

```json
{
  "intent": {
    "resource_url": "https://example.com/api",
    "allowed_payees": ["0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E"],
    "max_atomic_usdc": "1000"
  },
  "challenge": {
    "resource": {"url": "https://example.com/api"},
    "accepts": [{
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "payTo": "0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E",
      "amount": "1000"
    }]
  },
  "payment": {
    "x402Version": 2,
    "resource": {"url": "https://example.com/api"},
    "accepted": {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "payTo": "0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E",
      "amount": "1000"
    },
    "payload": {"authorization": {
      "from": "0x1111111111111111111111111111111111111111",
      "to": "0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E",
      "value": "1000",
      "nonce": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "validAfter": "1",
      "validBefore": "1000"
    }}
  }
}
```

This static illustration would fail a current-time preflight due to the expired example validity window. It contains no live signature or executable buying authority. `1000` USDC atomic units = $0.001 USDC.

## What the assessment actually tests

- x402 v2 and exact Base USDC requirements; the offered terms must match the accepted terms.
- Explicit recipient allowlist, amount cap, payer/recipient address shape, EIP-3009 amount correspondence, and nonce format.
- Agreement between caller-intended HTTPS resource and **metadata claimed by** both the challenge and payment preview.
- Current authorization validity interval, no longer than one hour under this product's conservative policy.
- Returns a SHA-256 fingerprint of the supplied intent parameters for local consistency comparison.

## What it cannot prove

**Resource URLs are not cryptographically bound by the underlying EIP-3009 signature** in this product. Untrusted challenge/payment preview metadata can still be altered. `static_checks_passed` is not a signed authorization, a trusted merchant identity, confirmation that the nonce was unused, or proof that the target was purchased.

No signature recovery, signing, blockchain nonce-state lookup, facilitator verification, mempool scanning, transaction settlement, escrow, insurance, service-quality verification, or indemnification is performed. It is *not* accurate to promise prevention of a $10 or $50 loss based on this static check alone.

## Safe deployment and economics

The initial purpose is to measure real willingness to pay for a narrowly scoped pre-signing check. Internal tests, synthetic transactions, bounty-funded buyers and discovery-prober payments must be excluded from recurring production-customer revenue. Actual independent Base USDC receipt + paid HTTP 2xx + buyer's production purpose + marginal costs are required for meaningful revenue attribution.

The integration is intentionally human-free at fulfillment time, but every purchase—including the preflight itself—must be within the buyer's previously approved automated spending policy.
