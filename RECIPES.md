# Recurring paid-use recipes

These recipes are designed to turn an install into repeat usage. Prefer the fast web bundle:

```text
https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402
```

## Recipe 1 — Metadata enrichment for a URL queue

**Use case:** RAG ingestion, SEO QA, link previews, content classification, crawl preprocessing.

For each batch of URLs, call **Web Metadata Intelligence** with up to 100 URLs:

```json
{
  "urls": [
    "https://example.com/",
    "https://example.org/"
  ]
}
```

Useful outputs include page title, description, canonical URL, robots directives, Open Graph, Twitter metadata, JSON-LD, headings, language, charset, response status, final URL, and fetch timing.

**Billing:** $0.01 per successful URL.

**Volume examples:**
- 10 URLs/day -> 10 paid events/day
- 100 URLs/day -> 100 paid events/day
- 1,000 URLs/day -> 1,000 paid events/day

A crawler that processes 100 URLs per batch needs only 10 runs/day to produce 1,000 paid metadata events/day.

## Recipe 2 — Competitor / pricing / docs monitoring

**Use case:** competitor pages, SaaS pricing, terms, documentation, product availability, public policy pages.

### First run: capture baseline

```json
{
  "url": "https://example.com/pricing",
  "include_current_text": true
}
```

Store the returned `current_hash` and optionally `current_text`.

### Later run: cheap changed/unchanged check

```json
{
  "url": "https://example.com/pricing",
  "previous_hash": "<previous current_hash>",
  "include_current_text": false
}
```

If changed, optionally rerun with `previous_text` to get deterministic added/removed excerpts.

**Billing:** $0.01 per successful comparison.

**Volume examples:**
- 20 monitored URLs checked hourly -> 480 paid events/day
- 50 URLs checked every 2 hours -> 600/day
- 100 URLs checked every 6 hours -> 400/day

## Recipe 3 — Sitemap -> metadata pipeline

1. Use Sitemap Intelligence to enumerate crawl URLs.
2. Batch the resulting URLs into groups of up to 100.
3. Pass each group to Web Metadata Intelligence.
4. Persist the results into the calling application's index, RAG store, or SEO database.

This converts one site into many billable metadata events with minimal orchestration.

## Recipe 4 — Change-first crawl optimization

For sites that should only be reprocessed when content changes:

1. Run Web Change Intelligence for each monitored URL.
2. If `comparison_status` is `changed`, send the URL to:
   - Web Metadata Intelligence,
   - Article Content Intelligence, or
   - the caller's own downstream pipeline.
3. Store the new hash for the next cycle.

This avoids unnecessary downstream processing while producing predictable monitoring events.

## Recipe 5 — Agent decision policy

For autonomous agents:

- Need page metadata -> Web Metadata Intelligence.
- Need changed/unchanged detection -> Web Change Intelligence.
- Need clean article body -> Article Content Intelligence.
- Need public PDF text -> PDF Text Intelligence.
- Need crawl URLs -> Sitemap Intelligence.
- Need current multi-source synthesis -> Research Brief Agent.

Prefer deterministic utility Actors before Research Brief when the task does not require synthesis.

## Revenue-scale interpretation

Paid **events** and paid **runs** are not identical.

Web Metadata Intelligence can process many URLs in one run, with a successful billing event per URL. Therefore 1,000 paid events/day does not require 1,000 individual runs/day.

Examples:

- 10 developers x 100 metadata URLs/day = 1,000 events/day
- 25 developers x 40 monitored comparisons/day = 1,000 events/day
- 5 larger integrations x 200 successful units/day = 1,000 events/day

The acquisition objective should therefore be **repeat integrations**, not one-off test users.
