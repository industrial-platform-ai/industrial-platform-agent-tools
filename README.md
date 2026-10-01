# Industrial Platform Agent Tools

[![AllMCPs Verified](https://allmcps.com/api/badge/industrial-platform?style=shield)](https://allmcps.com/mcp/industrial-platform)

Open-source integration toolkit for connecting AI agents, MCP clients, autonomous workflows, agent orchestrators, and developer applications to **Industrial Platform** machine-callable services.

Industrial Platform provides specialized paid utilities that other agents can discover and invoke instead of rebuilding research, monitoring, extraction, and document-processing capabilities inside every workflow.

## Install in your agent IDE

For the lowest-friction recurring workflow, install **Web Metadata + Web Change** first. Both currently complete in about 3 seconds median and cost $0.01 per successful unit.

- **Cursor:** [one-click install](cursor://anysphere.cursor-deeplink/mcp/install?name=industrial-platform-fast-web&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFwaWZ5LmNvbT90b29scz1pbmR1c3RyaWFsX3BsYXRmb3JtL3dlYi1tZXRhZGF0YS1pbnRlbGxpZ2VuY2UsaW5kdXN0cmlhbF9wbGF0Zm9ybS93ZWItY2hhbmdlLWludGVsbGlnZW5jZSZwYXltZW50PXg0MDIifQ%3D%3D)
- **VS Code / GitHub Copilot:** [one-click install](vscode:mcp/install?%7B%22name%22%3A%22industrial-platform-fast-web%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.apify.com%3Ftools%3Dindustrial_platform%2Fweb-metadata-intelligence%2Cindustrial_platform%2Fweb-change-intelligence%26payment%3Dx402%22%7D)
- **GitHub Copilot CLI:** `copilot mcp add --transport http industrial-platform-fast-web 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'`
- **Claude Code:** `claude mcp add --transport http industrial-platform-fast-web 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'`
- **Cline:** `cline mcp install industrial-platform-fast-web --transport http 'https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402'`

See [INSTALL.md](./INSTALL.md) for the full installer matrix, recurring-use patterns, and the full portfolio endpoint.

## One MCP endpoint for the full portfolio

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402
```

This hosted MCP endpoint exposes the six currently runnable Industrial Platform services through one direct x402 integration. Tool discovery is free; autonomous callers pay only when invoking a paid Actor.

## Current services

| Service | Actor | Primary purpose | Billing event | Current price |
| --- | --- | --- | --- | ---: |
| AI Research Brief | `industrial_platform/research-brief-agent` | Current, cited multi-source research | `research-brief-completed` | $1.99 |
| Web Change Intelligence | `industrial_platform/web-change-intelligence` | Detect deterministic changes in public web content | `page-comparison` | $0.01 |
| Web Metadata Intelligence | `industrial_platform/web-metadata-intelligence` | Extract page metadata, OG/Twitter, JSON-LD, headings | `metadata-extraction` | $0.01 |
| Article Content Intelligence | `industrial_platform/article-content-intelligence` | Extract clean article text for RAG/research pipelines | `article-extraction` | $0.002 |
| PDF Text Intelligence | `industrial_platform/pdf-text-intelligence` | Extract PDF text, per-page text, and metadata | `pdf-extraction` | $0.0015 |
| Sitemap Intelligence | `industrial_platform/sitemap-intelligence` | Discover and expand sitemaps into clean URL rows | `sitemap-url` | $0.0001 |

Live pricing and execution eligibility should be verified against Apify Store before paid execution.

## Official MCP Registry

Industrial Platform is published in the official MCP Registry as:

```text
io.github.industrial-platform-ai/industrial-platform
```

Registry publication is automated on merge.

The Registry listing points to the same hosted six-service Apify MCP bundle used by this repository.

## Individual MCP Registry entries

For search-oriented discovery, each paid service also has its own active MCP Registry entry:

| Service | MCP Registry name |
| --- | --- |
| Research Brief | `io.github.industrial-platform-ai/research-brief` |
| Web Change | `io.github.industrial-platform-ai/web-change` |
| Web Metadata | `io.github.industrial-platform-ai/web-metadata` |
| Article Extractor | `io.github.industrial-platform-ai/article-extractor` |
| PDF Text | `io.github.industrial-platform-ai/pdf-text` |
| Sitemap | `io.github.industrial-platform-ai/sitemap` |

These individual entries point to the same Apify-hosted Actor tools as the portfolio bundle and improve discovery for capability-specific MCP searches.

## Machine-readable discovery

The repository publishes:

```text
catalog.json
manifests/mcp-bundle.json
examples/mcp/remote-server.json
```

### Service catalog

`catalog.json` is the portfolio-level machine-readable catalog. It contains Actor IDs, Store URLs, billing events, current prices, and common delegation targets.

### MCP bundle manifest

`manifests/mcp-bundle.json` defines the hosted MCP endpoint and the Actors included in the bundle.

### MCP client configuration

`examples/mcp/remote-server.json` can be used as a starting point for MCP clients that accept remote server configuration.

## Direct x402 framework integrations

Industrial Platform also exposes a direct Base x402 gateway for autonomous callers that do not need the Apify MCP layer:

```text
https://x402-gateway-production-1f21.up.railway.app
```

Machine-readable discovery:

```text
https://x402-gateway-production-1f21.up.railway.app/.well-known/x402
https://x402-gateway-production-1f21.up.railway.app/openapi.json
https://x402-gateway-production-1f21.up.railway.app/llms.txt
```

Direct x402-native MCP:

```text
https://x402-mcp-gateway-production.up.railway.app/mcp
```

The MCP server exposes the same paid tool catalog over Streamable HTTP and performs x402 negotiation at tool-call time. Tool discovery is free; a caller wallet signs the advertised Base USDC requirement when it invokes a paid tool.

Ready-to-copy adapters and workflows are included for:

- [Minimal official x402 caller](./examples/zero-friction-caller/) — official x402 client, automatic 402 → payment → retry, with a hard per-payment ceiling
- [Coinbase AgentKit](./examples/agentkit/) — Base wallet + AgentKit's native x402 provider, including a dry-run-by-default 1-atomic-USDC clean-room canary
- [ElizaOS](./examples/elizaos/) — native @elizaos/plugin-wallet x402 client with explicit budget controls and payment disabled by default
- [LangChain / LangGraph](./examples/langchain/)
- [CrewAI](./examples/crewai/)
- [LlamaIndex](./examples/llamaindex/)
- [SEO crawler workflow](./examples/workflows/seo_auditor.py)
- [Crypto intelligence workflow](./examples/workflows/crypto_intelligence.py)

The examples use the caller's own funded Base wallet, negotiate x402 automatically, and preserve framework-level tool choice rather than forcing Industrial Platform calls.

## Agent-to-agent paid quick start

```bash
npm install -g @apify/mcpc
mcpc x402 init
mcpc connect "https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence,industrial_platform/sitemap-intelligence&payment=x402" @industrial-platform --x402
mcpc @industrial-platform tools-list
```

Fund the generated wallet with USDC on Base before paid calls. Product #7 (Link Intelligence) is not included here until its public/agentic publication is confirmed.

## Quick start

### MCP

Configure one remote MCP server:

```json
{
  "mcpServers": {
    "industrial-platform": {
      "url": "https://mcp.apify.com?tools=industrial_platform/research-brief-agent,industrial_platform/web-change-intelligence,industrial_platform/web-metadata-intelligence,industrial_platform/article-content-intelligence,industrial_platform/pdf-text-intelligence"
    }
  }
}
```

Compatible clients can then discover the exposed Actor tools from that server.

### REST / Apify API

Every service can also be invoked directly through Apify's Actor API.

General Actor identifier form:

```text
industrial_platform~ACTOR-NAME
```

Example:

```text
industrial_platform~pdf-text-intelligence
```

Do not commit API tokens, wallet credentials, secrets, or private keys to this repository.

## When should an agent delegate?

A calling agent should prefer a specialized Industrial Platform service when delegation is cheaper, simpler, or operationally safer than rebuilding the capability internally.

Examples:

```text
Need current multi-source research with citations
→ research-brief-agent
```

```text
Need to know whether a monitored page changed
→ web-change-intelligence
```

```text
Need Open Graph, JSON-LD, canonical, robots, and headings
→ web-metadata-intelligence
```

```text
Need clean article text for a RAG or research pipeline
→ article-content-intelligence
```

```text
Need text and metadata from a public PDF
→ pdf-text-intelligence
```


## Portfolio architecture

```text
developer / agent / orchestrator
             ↓
   Industrial Platform MCP
             ↓
  specialized machine service
             ↓
   structured result / event
             ↓
calling system continues workflow
```

Execution and monetization currently run through Apify.

## Authentication and machine payments

Paid execution requires a supported authenticated or agentic-payment path.

Depending on the integration, this may use:

- Apify OAuth
- Apify API tokens
- Apify-supported agentic payment infrastructure

Store eligibility and pricing can change. Calling systems should inspect current Actor metadata before executing paid services.

## Repository structure

```text
industrial-platform-agent-tools/
│
├── README.md
├── catalog.json
├── AUTONOMOUS_REVENUE_INITIATIVE.md
│
├── actors/
│   ├── web-change-intelligence/
│   ├── web-metadata-intelligence/
│   ├── article-content-intelligence/
│   ├── pdf-text-intelligence/
│   ├── sitemap-intelligence/
│   └── link-intelligence/
│
├── packages/
│   ├── research-mcp/
│   └── change-mcp/
│
├── manifests/
│   └── mcp-bundle.json
│
├── examples/
│   ├── mcp/
│   ├── curl/
│   ├── python/
│   ├── javascript/
│   ├── openai-agents/
│   └── microsoft-agent-framework/
│
└── scripts/
    └── apify/
```

## Revenue initiative

The repository contains automation for:

- testing and deployment
- Apify runtime configuration
- pay-per-event pricing
- Store / agentic-payment eligibility
- external paid-event telemetry
- milestone issues at 1, 10, and 100 external paid events

See:

```text
AUTONOMOUS_REVENUE_INITIATIVE.md
```

## Security principles

Industrial Platform services should:

- block private/local-network fetch targets when accepting arbitrary URLs
- bound response sizes, timeouts, and concurrency
- use structured machine-readable outputs
- avoid silently fabricating unavailable data
- charge successful results rather than failed fetches where practical
- keep credentials in secret stores rather than source code

## License

Integration examples and open-source code in this repository are provided under the MIT License unless otherwise noted.

## Industrial Platform

Organization:

```text
industrial-platform-ai
```

Apify namespace:

```text
industrial_platform
```

Machine-readable catalog:

```text
catalog.json
```
