# Article Content Intelligence

LLM-free article extraction for AI agents, RAG pipelines, research workflows, and automated systems.

## Input

```json
{
  "urls": [
    "https://example.com/article"
  ]
}
```

Up to 100 unique public HTTP/HTTPS article URLs can be processed per run.

## Successful output

Each successful article can include:

- title
- description
- author
- published / modified metadata when present
- canonical URL
- language
- clean article text
- word count
- reading-time estimate
- JSON-LD
- final URL
- HTTP status
- response bytes
- latency

The Actor uses deterministic HTML extraction and does not call an LLM.

## Pricing event

```text
article-extraction
```

One successful article extraction produces one event. Failed URLs are returned as error records without an extraction event.
