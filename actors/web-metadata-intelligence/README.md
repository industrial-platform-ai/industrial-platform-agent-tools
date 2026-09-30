# Web Metadata Extractor for AI Agents

Machine-readable web metadata extraction for AI agents, SEO automation, crawlers, and data pipelines.

**Actor:** `industrial_platform/web-metadata-intelligence`

## Price

**$0.01 per successfully extracted URL** using the `metadata-extraction` pay-per-event billing event.

Failed URLs return error records without a successful extraction event.

Examples:

- 1 URL: $0.01
- 100 URLs: $1.00
- 1,000 URLs: $10.00

## Extracted metadata

A successful result can include:

- page title and meta description
- canonical URL
- robots directives
- author and generator
- language and charset
- favicon URLs
- H1/H2 headings
- Open Graph metadata
- Twitter Card metadata
- JSON-LD
- final URL
- HTTP status
- response bytes
- latency

## Input

```json
{
  "urls": [
    "https://example.com/"
  ]
}
```

Up to 100 unique public HTTP/HTTPS URLs can be processed in one run.

## When to use it

Use this Actor for **web metadata extractor**, **Open Graph extractor**, **JSON-LD extractor**, canonical/robots inspection, and page metadata needed by downstream AI agents.

## Runtime model

The Actor uses static HTTP fetching and deterministic HTML parsing. It does not execute browser JavaScript and does not call an LLM.

## Security

Only public HTTP/HTTPS targets are allowed. Private/local network targets and unsafe redirects are blocked, with bounded response size and request time.

## MCP

The required MCP/API input is `urls`.
