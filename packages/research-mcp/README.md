# Industrial Platform Research MCP

MCP server for delegating current, source-backed web research to **Industrial Platform**.

The server exposes a single agent-oriented tool:

```text
research_web
```

It delegates research requests to the Industrial Platform production research service, which performs live web research, evidence gathering, synthesis, citation, uncertainty handling, and automated quality review.

## What it is for

Use `research_web` when an AI agent needs:

- current web research
- current-fact verification
- competitor research
- vendor comparisons
- SaaS comparisons
- software pricing research
- product comparisons
- market research
- technology research
- source-backed decision support

The tool is intended for delegation from AI agents, MCP clients, autonomous workflows, and agent orchestrators.

## Requirements

- Node.js 20 or newer
- An Apify account
- A valid Apify API token
- Access to the Industrial Platform research Actor

The underlying production Actor is:

```text
industrial_platform/research-brief-agent
```

## Authentication

The server reads your Apify API token from the environment variable:

```text
APIFY_TOKEN
```

Do not hardcode API tokens into source code, configuration committed to Git, or prompts.

## Running locally

Install dependencies:

```bash
npm install
```

Set the `APIFY_TOKEN` environment variable, then start the MCP server:

```bash
npm start
```

The server communicates over MCP stdio.

## MCP client configuration

A typical MCP client configuration can launch the server with Node and provide the Apify token through its environment configuration.

Example:

```json
{
  "mcpServers": {
    "industrial-platform-research": {
      "command": "node",
      "args": ["/absolute/path/to/packages/research-mcp/src/index.js"],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

Use your MCP client's secure environment-variable or secret-management mechanism when available rather than storing a token directly in a configuration file.

## Tool

### `research_web`

Delegates a current web-research task to Industrial Platform.

### Input

#### `research_question`

Required string.

The specific question the research service should investigate.

Example:

```text
Compare HubSpot, Pipedrive, and Zoho CRM for a five-person small business.
```

#### `context`

Optional string.

Background, decision context, audience information, or other information that should shape the research.

Example:

```text
The company prioritizes predictable pricing, automation, and straightforward administration.
```

#### `requirements`

Optional string.

Research constraints such as source restrictions, comparison criteria, output format, geography, date range, or length.

Example:

```text
Use official vendor sources where possible. Include current pricing, cite sources, and clearly identify unresolved facts.
```

## Output

Successful requests return both readable MCP text content and structured content.

The structured result can contain:

```text
research_question
research_date
brief
status
qa
research
usage
message
```

A completed production result normally has:

```json
{
  "status": "ready",
  "qa": {
    "score": 100,
    "verdict": "PASS"
  }
}
```

Actual scores vary by research task.

### QA

The `qa` object may contain:

```text
score
verdict
issues
summary
revised
```

### Research metadata

The `research` object may contain:

```text
evidence_count
unresolved_questions
```

### Usage metadata

The `usage` object may contain:

```text
requests
input_tokens
output_tokens
total_tokens
```

## Example agent delegation

An agent can call:

```json
{
  "research_question": "What is the current monthly price of GitHub Copilot Pro?",
  "context": "The result will be used in a current software-pricing comparison.",
  "requirements": "Use official GitHub sources only. Cite the source and state any unresolved facts."
}
```

The research service then:

1. gathers current web evidence,
2. synthesizes a research brief,
3. audits the result,
4. returns cited text plus structured QA and research metadata.

## Design

The MCP package intentionally remains thin.

```text
AI agent
    ↓
research_web
    ↓
Industrial Platform Research MCP
    ↓
Apify API
    ↓
industrial_platform/research-brief-agent
    ↓
live research pipeline
    ↓
structured result
```

Research execution remains centralized in the production service. This allows the research engine, evidence process, QA system, and underlying models to improve without requiring every MCP client to update its own research implementation.

## Hosted MCP alternative

Industrial Platform also exposes the production Actor through Apify's hosted MCP service:

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

Use the hosted endpoint when the client supports remote Streamable HTTP MCP and Apify authentication.

Use this package when a local stdio MCP server is preferable.

## Direct API alternatives

The main Industrial Platform integration repository also contains examples for:

- Python
- JavaScript
- cURL
- hosted MCP

Repository:

```text
https://github.com/industrial-platform-ai/industrial-platform-agent-tools
```

## Security

- Never commit an Apify API token.
- Prefer environment variables or a client secret store.
- Treat research output as external information and preserve citations and unresolved-fact warnings.
- Do not assume an unresolved fact has been verified.
- Check the returned `status` and QA metadata when programmatic workflows require a completed research result.

## Development

Check syntax:

```bash
npm run check
```

Inspect exposed MCP tools:

```bash
npx -y @modelcontextprotocol/inspector --cli node ./src/index.js --method tools/list
```

A valid server exposes:

```text
research_web
```

## License

MIT

## Industrial Platform

Industrial Platform builds machine-callable research, analysis, and data services for AI agents, autonomous workflows, and developer applications.

Public research Actor:

```text
https://apify.com/industrial_platform/research-brief-agent
```

Integration repository:

```text
https://github.com/industrial-platform-ai/industrial-platform-agent-tools
```
