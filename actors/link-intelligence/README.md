# Link Extractor for AI Agents

Deterministic structured link extraction for AI agents, crawlers, RAG ingestion, SEO automation, and website-analysis pipelines.

**Actor:** `industrial_platform/link-intelligence`

## Price

**$0.0005 per successfully processed page** using the `link-extraction` pay-per-event billing event.

Failed page fetches return error records without a successful extraction event.

Examples:

- 1 page: $0.0005
- 100 pages: $0.05
- 1,000 pages: $0.50

## Output

For each successfully fetched page the Actor returns:

- normalized target URL
- original `href`
- anchor text
- `rel` flags
- target attribute
- protocol
- internal/external classification
- nofollow / UGC / sponsored flags
- coarse DOM location: header, nav, main, article, aside, footer, or body
- page-level raw, eligible, unique, internal, external, and non-HTTP counts
- final URL, HTTP status, response bytes, and latency

## Input

```json
{
  "urls": ["https://example.com/"],
  "max_links_per_page": 1000,
  "deduplicate": false,
  "include_non_http": false,
  "include_fragments": false
}
```

Up to 100 unique public HTTP/HTTPS pages can be processed in one run.

## Runtime model

The Actor uses static HTTP fetching and deterministic HTML parsing. It does not execute browser JavaScript and does not call an LLM.

## Security

Only public HTTP/HTTPS source pages are allowed. Private/local network targets and unsafe redirects are blocked, with bounded response size and request time.
