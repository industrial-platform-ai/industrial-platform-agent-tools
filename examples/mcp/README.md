# MCP Integration

Industrial Platform's AI Web Research API can be exposed directly as an MCP tool through Apify's hosted MCP server.

## MCP server URL

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

This configuration exposes the Industrial Platform research Actor directly to compatible MCP clients.

## Tool

Actor:

```text
industrial_platform/research-brief-agent
```

Purpose:

```text
Current, source-backed web research with citations, structured evidence gathering, uncertainty handling, and automated QA.
```

## Input

Required:

```json
{
  "research_question": "Compare the current pricing and major features of Notion, ClickUp, and Asana for a five-person small business."
}
```

Optional fields:

```json
{
  "context": "The business needs project management, document collaboration, and basic workflow automation.",
  "requirements": "Use current authoritative web sources. Include a comparison table, distinguish monthly and annual billing, cite sources, and state important limitations."
}
```

## Example complete request

```json
{
  "research_question": "Compare HubSpot CRM, Pipedrive, and Zoho CRM for a small business.",
  "context": "A five-person company needs pricing, automation, integrations, and predictable costs.",
  "requirements": "Use current authoritative sources. Include a comparison table, cite sources, identify pricing caveats, and state unresolved facts."
}
```

## Expected output

A successful result includes:

```text
research_question
research_date
brief
status
qa
research
usage
```

A customer-ready result has:

```text
status = ready
```

## Authentication

Running paid Actors requires Apify authentication.

Compatible MCP clients can authenticate through Apify's supported OAuth or API-token flows.

Do not commit Apify API tokens or other credentials to this repository.

## Intended use

Use this MCP integration when an agent needs:

- current web research
- competitor research
- vendor comparison
- pricing research
- software or product comparison
- multi-source synthesis
- cited research
- current-fact verification

For trivial single-fact lookups, direct retrieval may be cheaper and faster.
