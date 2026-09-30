# Product 8 — Robots Policy Intelligence

## Objective

Provide a deterministic robots.txt policy primitive for AI agents, crawlers, RAG ingestion, SEO automation, and website monitoring.

## Machine contract

Input:

- up to 100 public domains or HTTP/HTTPS URLs
- optional user agents to evaluate
- optional paths to test
- timeout and concurrency controls

Output per site:

- robots.txt URL and HTTP state
- parsed user-agent groups
- Allow / Disallow rules
- Crawl-delay values
- declared sitemap URLs
- policy decisions for every requested user-agent/path pair
- matched rule and match length
- fetch bytes and latency

## Economics

Primary billing event: `robots-analysis`.

Initial price: **$0.0005 per successfully analyzed site**.

A missing robots.txt is a valid analysis result (default allow) and can be billed. Network/invalid-target failures are not billed.

## Implementation principles

- no LLM dependency
- standards-oriented deterministic rule matching
- private/local-network targets blocked
- redirect targets revalidated
- bounded response size and timeout
- structured machine-readable output
