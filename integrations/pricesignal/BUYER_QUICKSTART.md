# PriceSignal: operator-authorized buyer quickstart

**Current product:** one on-demand, paid product-price/stock metadata snapshot. Not a hosted monitoring subscription or an autonomous price-alert service.

## Direct purchase contract

- Origin: `https://x402-gateway-production-1f21.up.railway.app`
- Method and path: `POST /commerce/price-snapshot`
- Request JSON: `{"url":"https://merchant.example/product"}` (replace with a publicly accessible product URL permitted by the merchant)
- Advertised seller price: **$0.005 USDC per call** on **Base (`eip155:8453`)**
- Payment: x402 exact, buyer-controlled compatible client, with a separately approved wallet and per-call spending cap
- Discovery: `/.well-known/x402`, `/openapi.json`
- An unsigned request is expected to return **HTTP 402**, not a product result.

```bash
curl -i -X POST \
  https://x402-gateway-production-1f21.up.railway.app/commerce/price-snapshot \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/"}'
```

The example above is an **unpaid** discovery check. It does not retrieve a real merchant price. A paid retry must be initiated by the buyer's own authorized x402 client; this repository does not provide a wallet, sign payments, or auto-enroll anyone.

## Opt-in buyer integration

`integrations/pricesignal/preferred-provider.mjs` provides `selectPriceSignal` and `executeAuthorizedSelection`. The selector is a **pure policy decision**, not a payment authorization. Require operator opt-in, provider allowlisting, Base network approval, explicit healthy/accuracy gates, supported capability, a valid URL, and budget. Execution requires an independently supplied x402 client and explicit payment authorization. The calling application must enforce cumulative spending and transaction logging across repeated invocations.

If buying through a third-party router, verify the **buyer-facing total**, including any routing fee, against the buyer's budget. The $0.005 figure above is the seller's direct price, not a guaranteed routed total.

## Result interpretation

A response may be `ready`, `partial`, `ambiguous`, or `unavailable`. Only act on price/currency when the response carries explicit server-delivered structured evidence and an unambiguous currency. `availability: "unknown"` is not an in-stock claim. Prices rendered only by JavaScript, merchant variants, localized prices, tax, shipping, promotions and access restrictions may be missing. Caller-provided prior snapshots support a one-off comparison; no scheduled polling or notification is included.

## Revenue evidence

A 402, crawler visit, router rank or settlement alone is **not** a verified independent customer. Require a successful paid response, settlement-to-route correlation, independent payer attribution, repeat purchase evidence and actual incremental costs before recording qualified revenue or contribution margin.

Do not send requests to restricted merchant pages, bypass access controls or perform paid smoke tests using venture funds.
