# OpenAI Agents SDK example

This example shows an OpenAI Agents SDK agent deciding for itself when to delegate current web research to Industrial Platform's `research_web` MCP tool.

The example deliberately does **not** force tool use. There is no `tool_choice="required"` setting. The agent receives a tool-selection policy in its instructions and decides whether the user's request warrants external research.

## What this validates

For the default test prompt, a successful run should show:

```text
Tool choice forced: no
Tool calls observed: ['research_web']
AUTONOMOUS_TOOL_SELECTION: PASS
```

The run then prints the final agent response produced after Industrial Platform returns its cited research result.

## Requirements

- Python 3.10+
- Node.js 20+
- npm / npx
- an OpenAI API key
- an Apify API token with access to the public Industrial Platform Actor

The MCP server itself is installed on demand from npm:

```text
industrial-platform-research-mcp@0.1.2
```

No API keys are stored in this repository.

## Install

From this directory:

### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell blocks the activation script, use:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Configure credentials

Set credentials only in your local shell or secret manager.

### Windows PowerShell

```powershell
$env:OPENAI_API_KEY = "YOUR_OPENAI_API_KEY"
$env:APIFY_TOKEN = "YOUR_APIFY_TOKEN"
```

### macOS / Linux

```bash
export OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
export APIFY_TOKEN="YOUR_APIFY_TOKEN"
```

Optionally set `OPENAI_MODEL` to override the Agents SDK's default model:

```powershell
$env:OPENAI_MODEL = "YOUR_SUPPORTED_MODEL"
```

## Run the autonomous-selection test

```powershell
python .\agent.py
```

The default prompt is intentionally research-heavy:

```text
Compare the current pricing and enterprise security features of Notion,
ClickUp, and Asana. Use current authoritative sources, cite them, and identify
any important unresolved facts.
```

Because tool choice is left on the normal automatic path, the validation passes only when the agent actually selects `research_web`.

You can also provide your own prompt:

```powershell
python .\agent.py "Compare the current pricing of three CRM vendors for a five-person company."
```

## Expected flow

```text
user request
    ↓
OpenAI Agents SDK agent
    ↓
agent decides whether current research is needed
    ↓
research_web
    ↓
industrial-platform-research-mcp
    ↓
Industrial Platform research Actor
    ↓
cited + QA-reviewed result
    ↓
parent agent continues and answers
```

## Cost note

This is a live integration example. A successful research-tool call can incur OpenAI API usage and a real Industrial Platform / Apify Actor run.

## Why stdio here

The example uses the published npm MCP package over stdio because it exposes the focused `research_web` tool directly and works without embedding credentials in source code.

For remote MCP clients, Industrial Platform also exposes:

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

## Security

Do not commit `OPENAI_API_KEY` or `APIFY_TOKEN`.

Use environment variables, a local secret store, or your deployment platform's secret manager.
