# First paid run

This is the shortest path from discovery to a real Industrial Platform paid invocation.

## Recommended target

Use **Web Metadata Intelligence** first:

- deterministic output
- about 3 seconds median runtime in recent production runs
- $0.01 per successful URL
- failed URL fetches do not produce the successful billing event

## Prerequisite

Use an x402-capable MCP client with a funded/authorized payment source.

With `mcpc`:

```bash
npm install -g @apify/mcpc
mcpc x402 init
mcpc connect "https://mcp.apify.com?tools=industrial_platform/web-metadata-intelligence&payment=x402" @industrial-platform --x402
mcpc @industrial-platform tools-list
```

The wallet/payment source setup is the one-time human/account step. After it is funded and authorized, an agent can invoke the paid tool repeatedly without a human approving every individual call, subject to the caller's own spending policy.

## First real paid invocation

Inspect the exact tool name returned by:

```bash
mcpc @industrial-platform tools-list
```

Then call the Industrial Platform Web Metadata tool with:

```json
{
  "urls": ["https://example.com/"]
}
```

A successful URL produces the `metadata-extraction` billing event at $0.01.

## Repeat-use pattern

For a URL queue:

```json
{
  "urls": [
    "https://example.com/",
    "https://example.org/"
  ]
}
```

The Actor accepts batches up to 100 URLs. A developer can therefore connect the tool once and feed recurring crawler / SEO / RAG / metadata-ingestion batches through the same integration.

## Change-monitoring pattern

Connect the change tool:

```bash
mcpc connect "https://mcp.apify.com?tools=industrial_platform/web-change-intelligence&payment=x402" @industrial-platform-change --x402
```

Baseline:

```json
{
  "url": "https://example.com/",
  "include_current_text": true
}
```

Store the returned `current_hash`.

Follow-up:

```json
{
  "url": "https://example.com/",
  "previous_hash": "<prior SHA-256>",
  "include_current_text": false
}
```

A successful comparison produces the `page-comparison` billing event at $0.01.

## Best buyer profile

The shortest path to autonomous paid usage is a developer/team that already has:

1. an x402-capable client or agent wallet,
2. a recurring crawler / monitoring / ingestion workload,
3. a spending policy that permits sub-dollar automated calls.

For that buyer, no new human approval is needed for each run after the initial connection/funding step.
