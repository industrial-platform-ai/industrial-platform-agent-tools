# Sitemap Intelligence

Deterministic sitemap discovery and URL extraction for AI agents, crawlers, RAG pipelines, SEO tooling, and automated workflows.

## Input

```json
{
  "start_urls": [
    "https://example.com"
  ]
}
```

Each start can be a domain, website URL, or direct sitemap URL.

For domains and website URLs the Actor:

1. checks `robots.txt` for Sitemap directives;
2. also tries `/sitemap.xml`;
3. recursively follows sitemap indexes;
4. supports XML, `.xml.gz`, plain-text URL lists, RSS, and Atom;
5. emits one deduplicated dataset row per discovered URL.

## Output

Each URL row can include:

- URL
- lastmod
- changefreq
- priority
- source sitemap
- discovery timestamp

## Pricing event

```text
sitemap-url
```

One successfully emitted unique URL produces one event. Failed sitemap fetches are not billed.

## Limits

Defaults:

- 20 starts per run
- 100 sitemap documents
- 50,000 unique URL rows

Hard maximum:

- 500 sitemap documents
- 100,000 URL rows
