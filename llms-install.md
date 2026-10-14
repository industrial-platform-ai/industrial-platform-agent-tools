# Cline / MCP installation

Industrial Platform offers two distinct remote MCP integrations. No local clone is required.

## Option A — Direct Industrial Platform commerce MCP (primary)

Production Railway service: `x402-mcp-gateway`. Remote commerce profile: `https://x402-mcp-gateway-production.up.railway.app/mcp/commerce`.

In Cline's MCP server settings, add a remote Streamable HTTP server using:

```json
{
  "mcpServers": {
    "industrial-platform-commerce": {
      "type": "streamableHttp",
      "url": "https://x402-mcp-gateway-production.up.railway.app/mcp/commerce"
    }
  }
}
```

Cline versions differ in supported transport labels and settings. If the client rejects `streamableHttp`, use its built-in remote HTTP MCP setup UI rather than assuming another transport works. This configuration is **not yet independently validated inside Cline**. Do not mark a Marketplace installation test passed until a real operator explicitly authorizes and completes one.

Verification without payment: connect, initialize, list tools, and confirm the commerce profile tools are present. Check published prices and Base payee against the live gateway manifest before authorizing any paid call: https://x402-gateway-production-1f21.up.railway.app/.well-known/x402 and https://x402-gateway-production-1f21.up.railway.app/pricing.json. Tool discovery does not authorize payment. A funded operator must separately approve wallet access, payment ceilings and purchases; do not submit secrets or sign on their behalf.

## Option B — Separate Apify MCP Actor bundle (legacy integration)

The six-tool Apify-hosted bundle remains an **alternative**, not the direct gateway:

```json
{
  "mcpServers": {
    "industrial-platform-apify": {
      "url": "https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402"
    }
  }
}
```

Apify tool discovery and paid execution follow Apify's own x402 MCP flow. This configuration was the subject of Cline Marketplace issue #2689; that issue does not establish direct-gateway acceptance or successful Cline installation.

## Operator-authorized installation evidence

A willing Cline operator can record: Cline version, connection result, MCP initialize/tools/list result, tool count/names, error if any, and whether any paid call was **separately authorized**. Do not make a paid call merely to test installation. Never share private keys, wallet signatures or proprietary data. Record successful installation only with actual Cline-client evidence.
