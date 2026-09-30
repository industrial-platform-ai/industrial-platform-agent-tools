# PDF Text Intelligence

Deterministic PDF text extraction for AI agents, RAG pipelines, research workflows, and automated systems.

## Input

```json
{
  "urls": [
    "https://example.com/document.pdf"
  ]
}
```

Up to 50 public PDFs can be processed per run.

## Successful output

Each successful PDF can include:

- full retained text
- per-page text
- page count
- title
- author
- subject
- creator / producer
- creation / modification dates
- response size
- final URL
- HTTP status
- latency

The Actor uses PDF.js and does not call an LLM.

## Pricing event

```text
pdf-extraction
```

One successful PDF extraction produces one event. Failed or image-only PDFs that return no substantial text are not billed.
