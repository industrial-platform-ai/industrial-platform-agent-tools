# Robots.txt Policy Analyzer for AI Agents

Deterministic robots.txt parsing and crawler-policy evaluation for AI agents, RAG pipelines, SEO tooling, and autonomous web crawlers.

**Actor:** `industrial_platform/robots-policy-intelligence`

## Price

**$0.0005 per successfully analyzed site** using the `robots-analysis` pay-per-event billing event.

A missing robots.txt is returned as a valid default-allow analysis result. Invalid targets and network failures are not billed.

## Output

Each result includes:

- normalized site origin
- robots.txt URL and HTTP state
- user-agent groups
- Allow / Disallow rules
- Crawl-delay
- declared sitemap URLs
- allowed/blocked decisions for requested user-agent/path combinations
- winning matched rule and match length
- fetch bytes and latency

## Input

```json
{
  "sites": ["https://example.com/"],
  "user_agents": ["*", "GPTBot", "ClaudeBot"],
  "test_paths": ["/", "/private", "/docs/page"]
}
```

Up to 100 unique sites can be analyzed in one run.

## Runtime model

The Actor uses direct HTTP fetching and deterministic parsing. It does not execute browser JavaScript and does not call an LLM.

## Security

Only public HTTP/HTTPS targets are allowed. Private/local network targets and unsafe redirects are blocked.
