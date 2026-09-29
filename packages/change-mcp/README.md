# Industrial Platform Change MCP

MCP server for deterministic web change detection through **Industrial Platform**.

The server exposes:

```text
check_web_change
```

It delegates to the Industrial Platform Web Change Intelligence Actor.

## Use cases

- pricing-page changes
- stock or availability changes
- documentation changes
- terms/policy changes
- competitor-page changes
- baseline fingerprint capture
- deterministic comparison against a prior normalized snapshot

## Requirements

- Node.js 20+
- an Apify account
- a valid Apify API token
- access to `industrial_platform/web-change-intelligence` after deployment

## Authentication

Set `APIFY_TOKEN`. Never commit API tokens.

## Running locally

```bash
npm install
npm start
```

## Tool input

Baseline:

```json
{ "url": "https://example.com/pricing" }
```

Detailed comparison:

```json
{
  "url": "https://example.com/pricing",
  "previous_text": "...current_text from the previous run...",
  "previous_hash": "...matching current_hash...",
  "selector": "main",
  "ignore_selectors": [".clock", ".rotating-banner"]
}
```

Compact comparison:

```json
{
  "url": "https://example.com/pricing",
  "previous_hash": "...current_hash from the previous run...",
  "include_current_text": false
}
```

A first call captures a baseline. A later caller can provide `previous_hash` for a low-bandwidth check or `previous_text` for a detailed diff.
