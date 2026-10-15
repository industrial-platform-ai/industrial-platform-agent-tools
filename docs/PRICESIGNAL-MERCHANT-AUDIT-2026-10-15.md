# PriceSignal public merchant evidence audit — 2026-10-15

**Scope:** Exactly three public product pages. Read-only page content and head metadata, no checkout, credentials, CAPTCHA bypass, merchant API purchases, or paid PriceSignal invocations. These are *source-observation checks*, not end-to-end PriceSignal accuracy certification.

| Merchant / product | Public displayed price | Displayed stock | Product meta price/currency found | What current extractor can establish without JSON-LD |
| --- | --- | --- | --- | --- |
| [Adafruit Pico 2W with Header](https://www.adafruit.com/product/6315) | $8.00 | 80 in stock | `product:price:amount=8.00`, `product:price:currency=USD` | Price 8.00/USD via `product_metadata` fallback, **stock unknown** from observed meta. Product page warns of multiple versions; no variant-specific guarantee. |
| [SparkFun RedBoard Qwiic](https://www.sparkfun.com/sparkfun-redboard-qwiic.html) | $21.95 | In stock | `product:price:amount=21.95`, `product:price:currency=USD` | Price 21.95/USD via `product_metadata` fallback, **stock unknown** from observed meta. |
| [Arduino UNO R4 WiFi](https://store.arduino.cc/products/uno-r4-wifi) | €30,50 (locale-formatted) | Not established from captured text | No `product:price:amount` / `product:price:currency` observed in page-head metadata | No reliable price via meta fallback. JSON-LD was not inspected, so an actual PriceSignal result may be ready, partial, ambiguous, or unavailable. Do not guess EUR from the visible symbol in the API. |

## Evidence and limits

- Pages were read on 2026-10-15 using a read-only public-page content extractor with page-head metadata; source URLs above are the merchant evidence. No access restrictions were bypassed.
- In `gateway/metadata.mjs`, `collectMeta($,'product')` maps `product:price:amount` to `product_metadata['price:amount']`, and similarly for currency. In `gateway/price-intelligence.mjs`, these values are considered **only when no usable Product/Offer JSON-LD price was selected**. Thus the two USD meta examples are supported fallback paths, not proof of their actual output when JSON-LD is present.
- The visible stock labels on Adafruit and SparkFun were not confirmed as Product/Offer structured availability. The current extractor intentionally reports `unknown` rather than inferring stock from page text.
- Locale-dependent prices, variants, dynamic rendering, and differing JSON-LD offers remain possible failure/ambiguity cases.
- No paid end-to-end request was made, so **0/3 end-to-end accuracy comparisons** were completed. Source-meta observations: **2/3 have explicit amount and currency matching the displayed product price**; **0/3 stock states verified through structured metadata**.
- The public gateway's most recently confirmed Railway deployment was commit `a57105afd48ab204ed66322a225bae5718bc2f77`; later code corrections on main were not confirmed deployed as of this audit. Do not claim the latest code is live.
- This audit must not be used as a marketing accuracy percentage or a substitute for three genuinely verified PriceSignal output comparisons.

## Release decision

**Accuracy gate remains OPEN / NOT PASSED.** A qualified buyer with its own authorization may purchase, but Industrial Platform must not self-fund tests to create settlements. Before a production accuracy claim, compare actual paid output obtained through independently authorized production use with contemporaneous merchant structured data for three permitted sites. Reject ambiguous or missing data rather than invent values.

No use of Naturalist Gallery, its store, 99 Coats, their customers, or their revenue. No new discretionary acquisition spending.
