# PDF Text Extractor for AI Agents

Deterministic PDF text extraction for AI agents, RAG pipelines, research workflows, and document automation.

**Actor:** `industrial_platform/pdf-text-intelligence`

## Price

**$0.0015 per successful PDF extraction** using the `pdf-extraction` pay-per-event billing event.

Failed PDFs and image-only PDFs with no extractable text are not billed as successful PDF extractions.

Examples:

- 1 PDF: $0.0015
- 100 PDFs: $0.15
- 1,000 PDFs: $1.50

## Output

A successful PDF result can include:

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

## Input

```json
{
  "urls": [
    "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
  ]
}
```

Up to 50 public PDFs can be processed per run.

## When to use it

Use this Actor for **PDF text extraction**, PDF-to-text workflows, RAG ingestion, document indexing, and page-level PDF text needed by downstream agents.

## Runtime model and limitations

The Actor uses PDF.js and does not call an LLM. It does **not** perform OCR, so scanned image-only PDFs without embedded text may return no successful extraction.

PDF downloads are size-bounded and only public HTTP/HTTPS targets are accepted.

## MCP

The required MCP/API input is `urls`.
