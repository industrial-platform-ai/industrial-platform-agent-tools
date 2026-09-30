# Product 7 — Link Intelligence

## Objective

Provide a low-cost deterministic link-extraction primitive for AI agents, crawlers, RAG pipelines, SEO automation, and website analysis.

## Machine contract

Input:

- one or more public HTTP/HTTPS pages
- optional per-page output cap
- optional URL deduplication
- optional non-HTTP link inclusion
- optional URL fragment retention
- timeout and concurrency controls

Output per page:

- final URL and HTTP metadata
- raw/eligible/unique link counts
- internal/external/non-HTTP counts
- structured link records with normalized URL, raw href, anchor text, rel flags, target, protocol, internal/external classification, and DOM location

## Economics

Primary billing event: `link-extraction`.

Initial price: **$0.0005 per successfully processed page**.

Failed page fetches are recorded without a successful extraction event.

## Implementation principles

- no LLM dependency
- static HTTP fetch path
- private/local-network targets blocked
- redirects revalidated
- bounded response size
- bounded per-page output
- deterministic structured JSON
