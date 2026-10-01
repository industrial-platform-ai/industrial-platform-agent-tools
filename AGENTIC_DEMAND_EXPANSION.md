# Agentic Demand Expansion — Corrected Products 8–20 Rubric

Updated: 2026-10-01

## Core correction

Do not rank product opportunities by ordinary Apify Store popularity alone.

Industrial Platform is specifically optimizing for autonomous machine-to-machine consumption. The relevant demand signal is therefore a combination of:

1. Actor is eligible for agentic payments / programmatic use.
2. Actor is in MCP_SERVERS, AGENTS, AI, AUTOMATION, DEVELOPER_TOOLS or has explicit API/agent workflow positioning.
3. High public run volume relative to unique users (runs per user is a proxy for automation intensity).
4. Metamorph/API integration activity where visible.
5. Repeated programmatic use rather than one-off interactive runs.
6. The task can be delivered reliably without a user login or manual step.
7. Industrial Platform can materially improve price, schema, latency, batching, or setup.
8. No hidden paid upstream API/proxy requirement under the current zero-spend constraint.

## Strong machine-heavy demand observed in Apify public Store data

Examples from 2026-10-01 public stats:

- Twitter scraping: danek/twitter-scraper — 553 users30d, 13,960,571 runs30d (~25,245 runs/user).
- TikTok scraping: clockworks/free-tiktok-scraper — 4,363 users30d, 2,037,559 runs30d; 384,637 metamorphs.
- Google SERP: scraperlink/google-search-results-serp-scraper — 2,323 users30d, 3,720,106 runs30d (~1,601 runs/user).
- LinkedIn batch profiles: apimaestro/linkedin-profile-batch-scraper-no-cookies-required — 437 users30d, 758,758 runs30d (~1,736 runs/user).
- LinkedIn profile detail: apimaestro/linkedin-profile-detail — 1,907 users30d, 2,073,960 runs30d (~1,088 runs/user).
- Instagram API scraping: apify/instagram-api-scraper — 955 users30d, 1,120,748 runs30d (~1,174 runs/user).
- TikTok data: apidojo/tiktok-scraper — 1,694 users30d, 1,624,236 runs30d (~959 runs/user).
- Twitter data: apidojo/twitter-scraper-lite — 2,135 users30d, 1,804,188 runs30d (~845 runs/user).
- YouTube channels: streamers/youtube-channel-scraper — 2,889 users30d, 1,533,669 runs30d (~531 runs/user).

MCP_SERVERS category examples with >=100 users30d:
- Email verifier & validator — 450 users30d, 124,826 runs30d.
- Facebook Marketplace — 274 users30d, 77,723 runs30d.
- Google Images API — 166 users30d, 49,698 runs30d.
- Threads scraper — 136 users30d, 58,345 runs30d.
- Fast Website Content Crawler — 130 users30d, 21,609 runs30d.
- Spotify scraper — 105 users30d, 11,097 runs30d.
- Trustpilot review scraper — 667 users30d, 30,690 runs30d.
- StepStone jobs — 428 users30d, 23,738 runs30d.
- Naukri jobs — 675 users30d, 9,087 runs30d.
- G2 reviews/products — 197 users30d, 4,231 runs30d.

These figures are demand references, not proof that every run is an autonomous paid transaction.

## Products 8–20 rule

A candidate product is not published merely because the reference task has >=100 users30d.

It must first pass:
- machine-heavy demand threshold;
- zero-login agent usability;
- deterministic JSON schema;
- no paid upstream dependency under current policy;
- zero-cost reliability smoke tests;
- materially better value proposition than a reference product.

Hostile sources that commonly need residential proxies, sessions or captcha solving remain research targets until a no-spend architecture is proven.

## Step 1 status

Existing direct x402 gateway:
- strict JSON request schemas;
- deterministic structured JSON responses;
- OpenAPI 3.1;
- machine-readable /.well-known/x402;
- /.well-known/agent.json;
- /.well-known/agent-card.json;
- llms.txt and skill.md;
- semantic descriptions tuned to agent task language;
- no buyer account/API key;
- x402 exact USDC payment.

Existing Apify actors are PAY_PER_EVENT and current public records mark the seven original actors as agentic-payment eligible.

The earlier human-demand 8–20 workflow is now validation-only and cannot auto-publish.

## Step 2 status — direct funded-agent routing

Industrial Platform direct gateway is live on:
- Base USDC: eip155:8453
- Polygon USDC: eip155:137
- Arbitrum USDC: eip155:42161

Same EVM payout address is used across all three.

Agent402 live external routing now sees Industrial Platform on all three networks.

Examples:
- task: read webpage text for RAG
  - Industrial Platform /web/markdown
  - $0.0009
  - semantic shortlist match
  - health 1
  - networks Base + Polygon + Arbitrum
- task: extract webpage metadata, network=polygon
  - Industrial Platform /metadata
  - $0.001
  - appears at top of returned external shortlist
  - networks Base + Polygon + Arbitrum

Current Base dispatch gate remains settlement_required: the wallet has not yet cleared Agent402's independent-settlement floor.

Polygon and Arbitrum are valuable because Agent402 operates daily real paid canaries on those rails. The gateway was added to those discovery rails without any seller-funded transaction.

## No fake seed volume

Do not self-pay merely to create volume. Agent402 explicitly distinguishes self-funded settlement and can mark it settlement_self_funded. Self-funded calls do not solve the trust bootstrap problem and violate the zero-spend objective.

The objective is independent third-party payments only.
