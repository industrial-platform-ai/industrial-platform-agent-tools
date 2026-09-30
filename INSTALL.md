# Install Industrial Platform paid web tools

The recommended developer entry point is the **fast web bundle**:

- Web Metadata Intelligence — $0.001 per successful URL
- Web Change Intelligence — $0.001 per successful comparison

Recent production runs complete in about 3 seconds median for each service. Use the larger six-tool portfolio only when you also need research, article extraction, PDF text, or sitemap discovery.

## Fast web bundle endpoint

```text
https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402
```

Tool discovery is free. Paid invocation uses the hosted x402 payment flow.

## Cursor — one click

Open this deeplink:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=industrial-platform-fast-web&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFwaWZ5LmNvbT90b29scz1pbmR1c3RyaWFsX3BsYXRmb3JtL3dlYi1tZXRhZGF0YS1pbnRlbGxpZ2VuY2UsaW5kdXN0cmlhbF9wbGF0Zm9ybS93ZWItY2hhbmdlLWludGVsbGlnZW5jZSZwYXltZW50PXg0MDIifQ%3D%3D
```

Cursor supports HTTP MCP servers and MCP install deeplinks.

## VS Code / GitHub Copilot — one click

Open:

```text
vscode:mcp/install?%7B%22name%22%3A%22industrial-platform-fast-web%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.apify.com%3Ftools%3Dindustrial_platform%2Fweb-metadata-intelligence%2Cindustrial_platform%2Fweb-change-intelligence%26payment%3Dx402%22%7D
```

Portable workspace configuration:

```json
{
  "mcpServers": {
    "industrial-platform-fast-web": {
      "type": "http",
      "url": "https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402"
    }
  }
}
```

GitHub Copilot CLI:

```bash
copilot mcp add --transport http industrial-platform-fast-web 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'
```

## Claude Code

```bash
claude mcp add --transport http industrial-platform-fast-web 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'
```

## Cline

```bash
cline mcp install industrial-platform-fast-web --transport http 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'
```

Cline currently opens an installation wizard for remote MCP servers; review the URL and payment configuration before saving.

## mcpc / direct x402

```bash
npm install -g @apify/mcpc
mcpc x402 init
mcpc connect "https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402" @industrial-platform-fast-web --x402
mcpc @industrial-platform-fast-web tools-list
```

## Full portfolio

Use this endpoint when the calling agent also needs cited research, article extraction, PDF text extraction, or sitemap discovery:

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402
```

## High-frequency use cases

The fastest path to recurring paid usage is to embed these tools into loops rather than use them as one-off utilities.

### Metadata ingestion

A crawler, RAG pipeline, SEO worker, content QA process, or link-preview system can send batches of up to 100 URLs. Each successful URL produces one paid metadata event.

### Change monitoring

A developer can store `current_hash` or `current_text` from a baseline run and repeat the comparison on a schedule for pricing pages, inventory, policies, documentation, or competitor pages.

### Economics

At current pricing:

- 10 successful metadata URLs = $0.10 gross event revenue
- 100 successful metadata URLs = $1.00 gross event revenue
- 1,000 successful metadata URLs = $10.00 gross event revenue
- 1,000 successful change comparisons = $10.00 gross event revenue

A single external Actor run can create multiple paid events for batch-priced services, so **paid events/day** and **paid runs/day** are different metrics.
