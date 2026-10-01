# Apify Demand Expansion — Products 8–20

Updated: 2026-10-01

## Decision

Do not treat zero paid runs as a pure waiting problem.

The existing portfolio is technically functional and agentic-payment eligible, but most current products target narrow tasks with almost no existing marketplace demand. Expansion is therefore demand-first: only publish products where a comparable task has at least 100 users in the previous 30 days on Apify, and where Industrial Platform can materially improve the buyer proposition without paid upstream APIs or residential proxies.

## Public demand evidence

Source: Apify public Store API `/v2/store?search=...`, field `stats.totalUsers30Days`.

Observed leading comparable actors:

- Google Maps Scraper — 39,567 users / 30d
- Instagram Profile Scraper — 29,588
- TikTok Scraper — 24,951
- Google Search Results Scraper — 20,776
- Instagram Post Scraper — 13,119
- Website Content Crawler — 12,172
- YouTube Scraper — 11,736
- LinkedIn Profile Scraper — 11,130
- Reddit Scraper Lite — 7,584
- Facebook Ads Library Scraper — 6,768
- YouTube Comments Scraper — 2,375
- YouTube Transcript Scraper — 2,347
- Amazon Product Scraper — 2,247
- Google Trends Scraper — 1,754
- Website Screenshot Generator — 1,088
- E-commerce Scraping Tool — 774
- YouTube Channel Email Scraper — 300
- YouTube Channel Search Scraper — 272
- Google News Scraper — 238
- Smart Article Extractor — 233

## Product design rule

Every public Industrial Platform Actor should improve on at least one meaningful dimension:
- materially lower price;
- batch-first array input for agents;
- no account/login/cookies required;
- success-only pay-per-event billing;
- simpler deterministic output schema;
- lower setup complexity;
- better RAG/agent-ready output.

Do not publish a clone merely because the category is popular.

## Products 8–20 source pack

Shared implementation:
- `actors/demand-pack/src/main.js`
- `actors/demand-pack/products.json`
- `.github/workflows/deploy-demand-pack.yml`

13 product definitions:

8. Website Content Crawler for AI Agents
9. URL to Markdown API for AI Agents
10. Google Trends Intelligence for AI Agents
11. Google News Search for AI Agents
12. Smart Article Extractor for RAG & AI Agents
13. YouTube Transcript Extractor for AI Agents
14. YouTube Video Data Scraper for AI Agents
15. YouTube Search API for AI Agents
16. YouTube Comments Scraper for AI Agents
17. YouTube Channel Intelligence for AI Agents
18. E-commerce Product Extractor for AI Agents
19. Google Search Results API for AI Agents
20. Reddit Search & Thread Scraper for AI Agents

## Publication status

Automatically eligible first wave after local no-cost smoke test:
- Website Content Crawler for AI Agents
- URL to Markdown API for AI Agents
- Smart Article Extractor for RAG & AI Agents
- E-commerce Product Extractor for AI Agents
- Google News Search for AI Agents

Built but intentionally withheld until zero-cost reliability tests pass:
- Google Trends
- YouTube transcript
- YouTube video
- YouTube search
- YouTube comments
- YouTube channel
- Google Search
- Reddit

The hostile/high-friction categories with even larger demand (Google Maps, Instagram, TikTok, LinkedIn, Facebook Ads, Amazon at scale) are not being shipped merely to chase user counts because reliable production scraping commonly requires browser/proxy infrastructure and can create platform/upstream cost. Revisit only if a zero-cost or buyer-funded architecture is available.

## Zero-spend deployment guard

The deployment workflow queries:
- `GET /v2/users/me`
- `GET /v2/users/me/limits`

It only deploys if at least $5 of included monthly usage-credit headroom exists. It does not intentionally create overage spending.

Cloud publication is quota-aware. If Apify returns `daily-publication-limit-exceeded`, the Actor remains built/private and the scheduled workflow retries later.

## Human gate

GitHub did not automatically start the newly committed workflow from the ChatGPT-authored commit.

Required action:
GitHub → industrial-platform-agent-tools → Actions → “Demand Pack Validate and Publish” → Run workflow → main.

After that, the workflow performs the budget guard, local smoke tests, package generation, safe product builds, and public/PPE configuration automatically.

## Direct x402 status

As of the latest check after the PayAPI submission:
- no new `X402_SETTLED` event;
- no paid POST 200;
- PayAPI accepted the listing and said its next action is to pay one canary call from its own wallet;
- no follow-up PayAPI settlement/approval email has arrived yet.

Conclusion: do not rely on waiting alone. Continue expanding into proven demand while keeping existing discovery/verification lanes alive.
