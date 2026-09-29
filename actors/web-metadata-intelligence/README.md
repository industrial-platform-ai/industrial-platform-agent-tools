# Web Metadata Intelligence

Machine-oriented web metadata extraction for AI agents and automated workflows.

## Input

```json
{
  "urls": [
    "https://example.com/",
    "https://www.apify.com/"
  ]
}
```

Up to 100 unique public HTTP/HTTPS URLs can be processed in one run.

## Successful output

Each successful URL can return title, description, canonical URL, robots directives, author, generator, language, charset, favicons, H1/H2 headings, Open Graph metadata, Twitter Cards, JSON-LD, final URL, HTTP status, response bytes, and latency.

The Actor performs static HTTP fetching and HTML parsing. It does not execute browser JavaScript or use an LLM.

## Pricing event

```text
metadata-extraction
```

One successful URL extraction produces one event. Failed URLs are returned as error records without an extraction event.
