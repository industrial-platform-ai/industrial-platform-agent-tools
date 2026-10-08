# Industrial Platform — optional x402 paid inference

## Commercial hypothesis
Sell a tightly scoped, recurring text-inference capability to already-funded x402
agent runtimes. Industrial Platform buys upstream model inference on demand and sells
one Base USDC x402 call, **not** GPU infrastructure or a generalized unlimited
proxy. This is an unproven acquisition experiment, not evidence of demand.

## Pilot product
- Canonical route: POST /ai/inference, fixed **$0.003 USDC** per successful result.
- Model: `google/gemini-3.1-flash-lite` through OpenRouter.
- Text-only chat messages (up to six), 4000 UTF-8 combined content bytes,
  16–512 completion tokens (default 256), no streaming, tools, images or files.
- No Industrial Platform account or buyer API key; x402 signing wallet required.
- Upstream/provider price cap **$0.25 per million input tokens**,
  **$1.50 per million output tokens**, using OpenRouter provider.max_price.
- Maximum *modeled* token cost at the enforced caps is roughly $0.001768
  per request (4000 input tokens + 512 completion tokens). This is an
  assumption, not an upstream invoice; actual provider accounting and charges
  must be measured. Before network fees/hosting, the nominal spread is
  ~$0.001232 per maximum-size successful request.
- Upstream availability, payment-settlement behavior, latency, and net margins
  must pass live tests before actively selling it to customers.

## Operational activation
1. Obtain an OpenRouter account and **fund it independently**.
2. Set `OPENROUTER_API_KEY` privately on the Railway `x402-gateway` production
   service. Never commit it, email it, or paste it into public logs/chats.
3. Set `INDUSTRIAL_INFERENCE_ENABLED=true` only when funded and ready.
4. Deploy the corrected syntax-valid gateway branch via code review/CI. The
   inference route is absent from paid routes and discovery until BOTH
   environment values are present.
5. GET `/ai/inference/status` should show enabled only after activation.
6. Run bounded test requests, verify **HTTP 200**, response text and
   PAYMENT-RESPONSE receipt; validate payment settlement and cost. Categorize
   them as TEST, not real external revenue.
7. Monitor upstream spending, 4xx/5xx, token usage, cost and real paid
   retention; switch off by clearing the enable toggle if costs exceed proceeds.

## Bounded demand test (no artificial revenue)
- First target: one independent operator already using paid LLMs via x402 with
  approved Base USDC spending who needs lower integration friction.
- Offer a direct use-case walkthrough, not an unsolicited integration or
  instruction to bypass spending restrictions.
- Limit the initial prospecting experiment to ~10 qualified contacts or seven
  days, then abandon/revise on zero independently funded first and repeat purchases.
- Scale only after the same external wallet returns for a **production**
  application task across UTC days. Do not count audits, probes, friends,
  reimbursement, synthetic traffic, one-time test transactions, or deployments.

## Revenue math, not a forecast
At $0.003/request, $63,000 monthly gross receipts would require 21 million
paid successful calls in 30 days (~700,000/day), before provider/network
costs. At the maximum modeled cost, the *gross spread* is about $25,872/month
before network fees/hosting at that throughput. This is an illustration of
why customer acquisition and recurring demand dominate architecture.

Compare on **net margin**, qualified paying wallets, paid calls per wallet,
retention across days, conversion from qualified demonstrations, provider cost,
and settlement success. Price changes must follow measured willingness-to-pay.
