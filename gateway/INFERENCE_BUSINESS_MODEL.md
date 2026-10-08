# Industrial Platform: x402-powered agent analysis

## Business model and license boundary
The commercial product is an Industrial Platform AI-powered data transformation
service, NOT a general-purpose AI model API proxy. Operators pay Industrial
Platform for a concrete output (digest, operational triage, action extraction),
not access to an upstream model, model choice, or chat endpoint.

**Do not sell raw model API access through OpenRouter.** The OpenRouter Terms of
Service (last updated 2026-08-31) explicitly prohibit using the service to
resell model API access or build a competing service (Section 7.4).
Section 5.1 acknowledges models integrated into a customer's own services,
subject to upstream model terms, flow-down obligations and review.
See https://openrouter.ai/terms/ and review Google model terms before
production activation. These documents do not constitute legal clearance.

For a true generic x402 inference router competitive with BlockRun, obtain
explicit model-provider/reseller authorization or a compatible wholesale
agreement; do not repurpose the OpenRouter key to circumvent the restriction.

## First paid product: agent analysis
- POST /ai/agent-analysis
- $0.003 Base USDC x402 per successful job
- One selected task: digest (summary and key points), triage (priority and next
  suggested step), or action_items (explicitly identified owners and deadlines)
- One user-supplied plain-text input, up to 4,000 UTF-8 bytes.
- Fixed server-side task prompt. Buyer cannot select models, inject system
  messages, stream, use tools, or request arbitrary completions.
- Structured JSON output, 384-token model output ceiling, and provider price
  cap $0.25/M input and $1.50/M output on Gemini 3.1 Flash Lite.
- No promise of factual verification; users should verify consequential advice.

### Economics
With 4,000-byte input and up to 384 provider output tokens, model cost is
roughly <=$0.001576 at the advertised $0.25/M and $1.50/M token rates,
assuming input token count no larger than the byte count plus system overhead.
The fixed service prompt incurs additional tokens. Actual spending may include
credit purchasing fees and other processing costs. Track provider generation
invoices and net spread, not a theoretical maximum or gross USDC flows.
At $0.003 per job, $63,000/month gross needs 21 million paid successful jobs
(~700,000/day), not just discovery listings.

## Activation: DO NOT enable before the following
1. Verify upstream model commercial terms and that the actual product is a
   proprietary structured analysis service, not a proxy/resale model API.
2. Set a funded OpenRouter operator account's OPENROUTER_API_KEY privately in
   Railway x402-gateway, never in GitHub, code or chat.
3. Set INDUSTRIAL_INFERENCE_ENABLED=true in that production service.
4. Confirm Railway release is healthy and GET /ai/agent-analysis/status shows
   the correct canonical route.
5. Perform small bounded test requests; verify JSON response, x402 receipt,
   onchain settlement and actual provider generation cost. Tests are not revenue.
6. Observe real independent customer retention and net margin. Turn the
   enable switch off if upstream spend exceeds collected proceeds.

## Bounded acquisition experiment
Find real, independently funded agent operators with repeatedly occurring
event or notification triage. Demonstrate an observed unmet need, one
approved funded Base USDC purchase and repeat purchases across UTC dates.
Use a 10-operator / 7-day acquisition limit. Stop if no independently funded
production buyer converts. Never count probes, audits, friends or sponsored
buyer loops as revenue.
