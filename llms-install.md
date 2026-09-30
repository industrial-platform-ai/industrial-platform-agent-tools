# Cline / MCP installation

Industrial Platform is a hosted MCP server. No local clone or package build is required.

## Connect the paid MCP bundle

Add this remote MCP server in Cline:

```json
{
  "mcpServers": {
    "industrial-platform": {
      "url": "https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402"
    }
  }
}
```

The server exposes six tools. Tool discovery is free. Paid calls use Apify's x402 MCP payment flow.

## Recommended tool selection

- Multi-source cited research: research-brief-agent
- Webpage change detection: web-change-intelligence
- Page metadata / JSON-LD / Open Graph: web-metadata-intelligence
- Clean article text: article-content-intelligence
- PDF text: pdf-text-intelligence
- Sitemap and crawl URL discovery: sitemap-intelligence

Prefer the cheapest deterministic tool that satisfies the task.

## Verification

After connection, list tools and confirm the six Industrial Platform tools are visible. The repository's automated MCP audits continuously validate the same hosted endpoint.

Payment credentials or wallet material must be configured in the MCP/x402 client and must not be committed to this repository.
