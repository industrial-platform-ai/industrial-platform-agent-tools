# Article Content Extractor for AI Agents

Deterministic article content extraction for AI agents, RAG ingestion, research pipelines, summarization, and automation.

**Actor:** `industrial_platform/article-content-intelligence`

## Price

**$0.002 per successful article extraction** using the `article-extraction` pay-per-event billing event.

Failed URLs are returned as error records without a successful extraction event.

Examples:

- 1 article: $0.002
- 100 articles: $0.20
- 1,000 articles: $2.00

## Output

A successful article can include:

- clean article body text
- title and description
- author
- published / modified metadata when present
- canonical URL
- language
- word count
- reading-time estimate
- JSON-LD
- final URL
- HTTP status
- response bytes
- latency

## Input

```json
{
  "urls": [
    "https://www.iana.org/help/example-domains"
  ]
}
```

Up to 100 unique public HTTP/HTTPS URLs can be processed per run.

## When to use it

Use this Actor for **article content extraction**, RAG ingestion, research corpora, article summarization pipelines, and clean text for downstream agents.

## Runtime model

The Actor uses deterministic static HTTP + HTML extraction and does not call an LLM. It does not execute client-side JavaScript.

## Security

Only public HTTP/HTTPS targets are accepted. Private/local targets and unsafe redirects are blocked, with bounded response size and timeout.

## MCP

The required MCP/API input is `urls`.
