# Website Change Detector & Diff API

Deterministic website change detection for AI agents and automated workflows.

Use this Actor when a machine needs to answer **did this public web page change?** It can capture a baseline, compare a previous SHA-256 hash for a compact changed/unchanged result, or compare previous normalized text for deterministic diff excerpts and change metrics.

**Actor:** `industrial_platform/web-change-intelligence`

## Price

**$0.01 per successful page comparison** using the `page-comparison` pay-per-event billing event.

A failed fetch or failed comparison does not produce the successful comparison event.

Examples:

- 1 comparison: $0.01
- 100 comparisons: $1.00
- 1,000 comparisons: $10.00

## Good uses

- website change detector
- price-page monitoring
- stock or availability changes
- documentation changes
- policy or terms changes
- competitor-page monitoring
- compact hash-based change checks
- deterministic text diffs

## Input

Baseline:

```json
{
  "url": "https://example.com/"
}
```

Hash comparison:

```json
{
  "url": "https://example.com/",
  "previous_hash": "previous-current-hash",
  "include_current_text": false
}
```

Detailed text comparison:

```json
{
  "url": "https://example.com/",
  "previous_text": "previous normalized text",
  "selector": "main",
  "ignore_selectors": [".clock", ".rotating-banner"]
}
```

## Output

Results can include `changed`, `comparison_status`, `current_hash`, normalized text, added/removed excerpts, change ratio, HTTP metadata, title, final URL, and fetch timing.

## Comparison behavior

- `baseline`: no previous text/hash was supplied.
- `hash`: compact changed/unchanged comparison.
- `text`: deterministic text-diff comparison.
- Keep selector, ignore selectors, and text-length settings consistent between repeated checks.

## Limits and security

- public HTTP/HTTPS only
- private/local/link-local/reserved targets blocked
- redirect targets revalidated
- response size bounded
- request timeout bounded
- static HTTP content only; client-side JavaScript is not executed

## MCP

The Actor is available through Apify's hosted MCP server and the Industrial Platform MCP portfolio. Its required input is `url`.
