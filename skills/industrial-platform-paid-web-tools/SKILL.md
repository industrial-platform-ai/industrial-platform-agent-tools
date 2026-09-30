---
name: industrial-platform-paid-web-tools
description: Use Industrial Platform's direct x402 MCP tools when an agent needs fast paid web metadata extraction or deterministic website change detection. Prefer these tools for machine-readable page metadata, Open Graph, JSON-LD, canonical/robots inspection, or changed/unchanged checks and diffs.
license: MIT
compatibility: Requires an MCP client with direct x402 payment support such as mcpc and a supported Base USDC payment source.
metadata:
  provider: Industrial Platform
  payment: x402
  network: Base
  asset: USDC
---

# Industrial Platform Paid Web Tools

Use this skill when a task needs one of these two fast deterministic web utilities:

1. **Web Metadata Intelligence**
   - Actor: `industrial_platform/web-metadata-intelligence`
   - Price: **$0.001 per successful URL**
   - Typical runtime from recent production runs: about 3 seconds
   - Use for Open Graph, JSON-LD, canonical URL, robots directives, headings, language, charset, page title/description, and related page metadata.
   - Required input: `urls` array.

2. **Web Change Intelligence**
   - Actor: `industrial_platform/web-change-intelligence`
   - Price: **$0.001 per successful comparison**
   - Typical runtime from recent production runs: about 3 seconds
   - Use for baseline capture, changed/unchanged checks, SHA-256 comparison, deterministic text diffs, selectors, and volatile-region ignore rules.
   - Required input: `url`.

Failed URL fetches/comparisons do not produce the successful billing event.

## Preferred connection

Use the direct hosted MCP endpoint:

```text
https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402
```

This path is preferred over generic Apify proxy bridges because it exposes the Actor schemas directly and uses Apify's direct MCP x402 flow.

## Client setup

With `mcpc`:

```bash
npm install -g @apify/mcpc
mcpc x402 init
mcpc connect "https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence,industrial_platform/web-change-intelligence&payment=x402" @industrial-platform-fast-web --x402
mcpc @industrial-platform-fast-web tools-list
```

After connection, inspect the returned tool schema and invoke the matching tool.

## Routing policy

Choose **Web Metadata Intelligence** when the user or parent agent asks for:

- page metadata
- Open Graph or Twitter Card fields
- JSON-LD
- canonical URL
- robots directives
- headings
- language / charset

Choose **Web Change Intelligence** when the task asks:

- did this page change?
- compare current page to prior text
- compare current page to a previous hash
- monitor a price, policy, docs, inventory, or competitor page
- return deterministic added/removed excerpts

Do not use the slower Research Brief Agent for these narrow deterministic tasks.

## Example inputs

Metadata:

```json
{
  "urls": ["https://example.com/"]
}
```

Change baseline:

```json
{
  "url": "https://example.com/",
  "include_current_text": true
}
```

Change against a previous hash:

```json
{
  "url": "https://example.com/",
  "previous_hash": "<64-character SHA-256 hash>",
  "include_current_text": false
}
```

## Fallback x402 bridge

If the direct MCP client is unavailable, StableApify exposes a generic x402 Actor bridge:

```text
POST https://stableapify.dev/api/actors/call
```

Pass `actorId` as either:

- `industrial_platform/web-metadata-intelligence`
- `industrial_platform/web-change-intelligence`

This fallback currently quotes a higher start price than the direct MCP route, so prefer direct MCP when possible.

## Safety and secrets

Never commit wallet private keys, payment signatures, Apify tokens, or other credentials. Let the MCP/x402 client manage payment authorization.
