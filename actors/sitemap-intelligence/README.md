# Sitemap URL Extractor for AI Agents

Deterministic sitemap discovery and URL extraction for AI agents, crawlers, RAG pipelines, SEO tooling, and automated workflows.

**Actor:** `industrial_platform/sitemap-intelligence`

## Price

**$0.0001 per unique emitted sitemap URL** using the `sitemap-url` pay-per-event billing event.

Failed sitemap fetches do not produce URL billing events.

Examples:

- 1 URL: $0.0001
- 1,000 URLs: $0.10
- 10,000 URLs: $1.00
- 100,000 URLs: $10.00

## Discovery behavior

For a domain or website URL, the Actor:

1. checks `robots.txt` for Sitemap directives;
2. tries `/sitemap.xml` as a fallback;
3. follows sitemap indexes recursively;
4. supports XML, `.xml.gz`, plain-text URL lists, RSS, and Atom;
5. emits one deduplicated row per discovered URL.

## Input

```json
{
  "start_urls": [
    "https://www.google.com/gmail/sitemap.xml"
  ]
}
```

A start may be a domain, website URL, or direct sitemap URL.

## Output

Each URL row can include:

- URL
- `lastmod`
- `changefreq`
- `priority`
- source sitemap
- discovery timestamp

## When to use it

Use this Actor for **sitemap extractor**, sitemap URL enumeration, crawl planning, website inventory, RAG ingestion planning, sitemap-index expansion, and SEO automation.

## Limits

Default limits:

- 20 starts
- 100 sitemap documents
- 50,000 unique URL rows

Hard maximum:

- 500 sitemap documents
- 100,000 URL rows

Only public HTTP/HTTPS resources are allowed; private/local network targets are blocked.

## MCP

The required MCP/API input is `start_urls`.
