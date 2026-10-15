# PriceSignal — Product Price Snapshot (experimental)

**Status:** Candidate paid tool; not proof of buyer demand. Product idea validated only by public competitor offerings, not a PriceSignal customer.

## API offer

- `POST /commerce/price-snapshot` — proposed and configured charge of **$0.005 USDC on Base** per authenticated x402 paid execution.
- Single caller-specified public product URL in a request.
- Reads the gateway's established SSRF-protected `runMetadata` path; does not introduce a second arbitrary network fetch.
- Parses server-delivered Product/Offer JSON-LD and product price metadata; treats multi-offer/variant ambiguity, malformed prices, absent currency and inaccessible websites as explicit uncertainty.
- Responds with product price, currency, availability, observed timestamp, original URL, resolved final URL, source field, observation hash, and optional price/availability difference against a caller-supplied previous snapshot.
- No claim that dynamic site prices, coupon prices, local delivery charges, taxes or variants are fully covered.

## Example

```bash
curl -i https://x402-gateway-production-1f21.up.railway.app/commerce/price-snapshot \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/"}'
```

An **unpaid** POST should return **HTTP 402** once deployed. The buyer should use a compatible x402 client and its own already-authorized wallet for a paid retry. No external/customer-funded purchase is triggered by any test here. The example domain is intentionally not a retail product page, so no numeric price is expected.

An optional `previous_snapshot` can contain `{url,status,price,currency,availability}` copied from a prior response for the same original URL; comparisons are disabled if either snapshot lacks unambiguous price/currency.

## What the hourly task can do

- Check health, authorization-independent route discovery, source-quality signals and actual paid delivery.
- Discover lawful operator-published agent integration opportunities.
- Recommend or prepare improvements and stop experiments without independent buyer traction.
- Correlate gateway delivery with Base settlement; classify unknown-wallet transfers as **unattributed**, not customer income.
- Build subscribed monitoring only after a genuine customer requests/purchases an automated schedule and sufficient authorization/persistent delivery infra exist.

## Production gates

1. All unit checks and existing gateway CI pass; `Dockerfile` includes the new module and test.
2. Production x402 manifest and OpenAPI advertise `/commerce/price-snapshot` at $0.005 with correct Base payee.
3. Unpaid POST yields HTTP 402 and `PAYMENT-REQUIRED`; never deliberately spend on a smoke test.
4. Test at least three authorized public product sites for source accuracy before marketing claims.
5. Record any first settled customer payments with full IPTP evidence. No fake traffic, paid-loop testing or self-purchases.

## Pricing evidence (observed 2026-10-14)

- Prisync advertises URL-based price monitoring from $99/month: https://prisync.com/compare-plans/
- Distill advertises generic webpage monitoring from $15/month: https://distill.io/pricing/
- These competitors indicate an established category. They do not establish that PriceSignal converts or that $0.005/call is profitable.

## Unit economics and kill criteria

Target request cost under $0.002 (network, egress, compute and payment costs measured empirically), leaving gross contribution at least $0.003 on a $0.005 paid call. This is a **target**, not a measured cost or validated margin.

Within 14 days of being live, require at least one *independent*, operator-attributable, genuinely production-intended paid purchase or compelling production-intent evidence to continue acquisition. Within 30 days, require a repeat payer or pause expansion and reassess positioning. Do not clone this into dozens of services without product-market validation.

Do not use Naturalist Gallery, 99 Coats or their Shopify store or customer records to market this service.