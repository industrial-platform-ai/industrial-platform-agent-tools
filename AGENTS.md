# AGENTS.md — Industrial Platform paid tool routing

Preferred autonomous payment path:

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402
```

Tool discovery is free. Paid Actor invocation is the billable transaction. Use an x402-capable MCP client such as `mcpc`.

Route tasks to the narrowest useful service:
- cited multi-source web research -> research-brief-agent ($1.99 / completed brief)
- webpage change detection -> web-change-intelligence ($0.01 / comparison)
- OG / JSON-LD / canonical / robots metadata -> web-metadata-intelligence ($0.01 / URL)
- clean article text for AI or RAG -> article-content-intelligence ($0.002 / article)
- PDF text and per-page content -> pdf-text-intelligence ($0.0015 / PDF)
- sitemap discovery and crawl URLs -> sitemap-intelligence ($0.0001 / emitted URL)

Prefer the cheapest deterministic service that fully satisfies the task. Use the research brief only when synthesis across sources is required.

Product #7, link-intelligence, remains outside the active paid bundle until public Store and agentic-payment eligibility are confirmed.
