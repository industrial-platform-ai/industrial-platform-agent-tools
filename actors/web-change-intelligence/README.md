# Web Change Intelligence

Deterministic, machine-callable web change detection for AI agents and automated workflows.

This Actor fetches a public web resource, normalizes meaningful text, computes a SHA-256 fingerprint, and optionally compares the result against a previous normalized snapshot or hash.

It intentionally does **not** use an LLM. The goal is a low-cost, composable primitive that can be called repeatedly by other agents.

## Actor name

```text
industrial_platform/web-change-intelligence
```

The Actor is deployment-ready in this repository. It is not live until it has been pushed to the Industrial Platform Apify account and published.

## Input

Minimal baseline run:

```json
{
  "url": "https://example.com/pricing"
}
```

Detailed comparison using the previous run's `current_text`:

```json
{
  "url": "https://example.com/pricing",
  "previous_text": "...previous normalized text...",
  "previous_hash": "...matching SHA-256 hash...",
  "selector": "main",
  "ignore_selectors": [".clock", ".rotating-banner"]
}
```

Compact changed/unchanged comparison:

```json
{
  "url": "https://example.com/pricing",
  "previous_hash": "...previous current_hash...",
  "include_current_text": false
}
```

## Output

A baseline run returns fields including:

```text
status
url
final_url
checked_at
http_status
content_type
title
comparison_mode
comparison_status
current_hash
text_length
original_text_length
text_truncated
current_text
fetch
```

A text comparison can additionally return:

```text
changed
previous_hash
diff.added_chars
diff.removed_chars
diff.change_ratio
diff.added_excerpt
diff.removed_excerpt
```

## Comparison contract

- `comparison_mode = baseline`: neither previous text nor previous hash was supplied.
- `comparison_mode = hash`: only a previous hash was supplied; result is compact changed/unchanged detection.
- `comparison_mode = text`: previous normalized text was supplied; detailed deterministic diff metadata can be returned.
- `current_hash` hashes exactly the normalized `current_text` scope after `max_text_chars` is applied. Keep `max_text_chars`, `selector`, and `ignore_selectors` consistent across repeated checks.

## Normalization

The Actor attempts to reduce irrelevant changes:

- scripts, styles, templates, SVG, canvas, iframes, and noscript content are removed from HTML;
- whitespace is normalized;
- JSON object keys are recursively sorted;
- a CSS selector can restrict comparison to one region;
- volatile page sections can be excluded with `ignore_selectors`.

The launch implementation compares the HTTP response body; it does not run a browser or execute client-side JavaScript. Browser rendering can be added later only if demand justifies the higher compute cost.

## Security and resource limits

- only public HTTP/HTTPS URLs are accepted;
- localhost, private, link-local, multicast, carrier-grade NAT, and reserved IP ranges are blocked;
- redirect targets are validated before they are followed;
- responses are limited to 5 MB;
- normalized comparison text is capped at 250,000 characters;
- request timeout is capped at 60 seconds.

These controls reduce SSRF exposure and bound per-call resource use. DNS validation reduces, but cannot mathematically eliminate, every DNS-rebinding scenario.

## Monetization

The implementation is ready for Apify pay-per-event pricing using the event:

```text
page-comparison
```

When the Actor is configured for PPE on Apify, a successful result is pushed with that event. Failed fetches and failed comparisons terminate without producing a billable result.

The exact launch price should be set after measuring average compute cost on real runs.

## Local development

```bash
npm install
npm run check
npm test
```

For a local Actor run, create the normal Apify local input file and run:

```bash
apify run
```

To exercise PPE locally:

```bash
ACTOR_TEST_PAY_PER_EVENT=true apify run
```

## Deployment

From the repository root:

```bash
apify push --dir ./actors/web-change-intelligence
```

The Apify CLI creates the Actor if `web-change-intelligence` does not already exist in the authenticated account.
