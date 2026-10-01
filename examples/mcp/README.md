# Industrial Platform MCP Integration

## Direct 43-tool x402 MCP gateway

For the full direct utility catalog, use the production Streamable HTTP MCP endpoint:

```text
https://x402-mcp-gateway-production.up.railway.app/mcp
```

This server exposes **43 paid tools** directly over MCP with x402 v2 settlement on **Base (eip155:8453) / USDC**. Payment requirements are returned in the x402 MCP structured payment shape, and compatible x402 MCP clients can enforce spend policies, sign with a caller-controlled wallet, retry automatically, and receive the tool result.

Machine-readable service status:

```text
https://x402-mcp-gateway-production.up.railway.app/
https://x402-mcp-gateway-production.up.railway.app/health
```

The direct MCP gateway is separate from the Apify-hosted portfolio bundle below. Use the direct endpoint for the low-cost 43-tool utility catalog; use the Apify bundle for the larger Actor-backed research/extraction products.

Industrial Platform's current service portfolio can be exposed through one hosted Apify MCP server.

## Full portfolio endpoint

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence
```

Apify supports comma-separated Actor full names in the `tools` query parameter, allowing a client to expose only selected Actors through one MCP server.

## Included Actors

```text
industrial_platform/research-brief-agent
industrial_platform/web-change-intelligence
industrial_platform/web-metadata-intelligence
industrial_platform/article-content-intelligence
industrial_platform/pdf-text-intelligence
industrial_platform/sitemap-intelligence
```

## Example remote MCP configuration

```json
{
  "mcpServers": {
    "industrial-platform": {
      "url": "https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence"
    }
  }
}
```

See `remote-server.json` for the repository version.

## What an agent can delegate

### Research Brief Agent

Use for current multi-source research, comparisons, pricing research, verification, and cited synthesis.

### Web Change Intelligence

Use when the agent needs to know whether a public page or endpoint changed relative to a previous hash or normalized text snapshot.

### Web Metadata Intelligence

Use for canonical URLs, robots metadata, headings, Open Graph, Twitter Cards, JSON-LD, language, and other page metadata.

### Article Content Intelligence

Use to extract clean article text and associated metadata for RAG, research, summarization, or downstream processing.

### PDF Text Intelligence

Use to extract text, page-level text, page count, and document metadata from public PDFs.

### Sitemap Intelligence

Use to discover robots.txt sitemaps, expand sitemap indexes, and return deduplicated crawl URLs with lastmod/changefreq/priority metadata.

## Authentication

The hosted Apify MCP server supports OAuth or bearer-token authentication.

Running paid Actors requires authentication or another supported payment path.

Never commit Apify API tokens or other credentials to this repository.

## Why use one bundle?

A portfolio-level server lets the calling agent choose the narrowest service for the task:

```text
question requires current cited research?
→ Research Brief Agent

need changed / unchanged?
→ Web Change Intelligence

need page metadata?
→ Web Metadata Intelligence

need article body?
→ Article Content Intelligence

need PDF text?
→ PDF Text Intelligence

need sitemap URLs for crawling or ingestion?
→ Sitemap Intelligence
```

This reduces tool-installation friction and lets the parent agent route each task to the lowest-cost specialized service that satisfies the requirement.

## Machine-readable catalog

For programmatic discovery outside MCP, read:

```text
../../catalog.json
../../manifests/mcp-bundle.json
```

The catalog contains Actor IDs, Store URLs, billing events, prices, and common delegation targets.
