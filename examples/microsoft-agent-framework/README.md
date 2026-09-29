# Microsoft Agent Framework example

This example shows a Microsoft Agent Framework agent deciding for itself when to delegate current web research to Industrial Platform's `research_web` MCP tool.

The example uses Microsoft Agent Framework's local stdio MCP support and the OpenAI Responses client. Tool use is not forced: the agent receives a policy describing when research is appropriate and chooses whether to call `research_web`.

## What this validates

For the default research-heavy prompt, a successful run should show:

```text
Tool choice forced: no
Tool calls observed: ['research_web']
AUTONOMOUS_TOOL_SELECTION: PASS
```

The final response is printed after the MCP research result is returned to the parent agent.

## Requirements

- Python 3.10+
- Node.js 20+
- npm / npx
- an OpenAI API key
- an Apify API token with access to the Industrial Platform Actor

The MCP server is installed on demand from npm:

```text
industrial-platform-research-mcp@0.1.1
```

## Install

### Windows PowerShell

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Configure credentials

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

Optionally set the Agent Framework OpenAI model:

```powershell
$env:OPENAI_CHAT_MODEL = "YOUR_SUPPORTED_MODEL"
```

## Run

```powershell
python .\agent.py
```

The default prompt requires current vendor information:

```text
Compare the current pricing and enterprise security features of Notion,
ClickUp, and Asana. Use current authoritative sources, cite them, and identify
any important unresolved facts.
```

You can supply a custom prompt:

```powershell
python .\agent.py "Compare the current pricing of three CRM vendors for a five-person company."
```

## Expected flow

```text
user request
    ↓
Microsoft Agent Framework agent
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
parent agent continues
```

## Why this example matters

Microsoft Agent Framework supports local MCP tools across providers that support function tools. This example uses the OpenAI client so the setup remains close to the OpenAI Agents SDK example while demonstrating a separate agent framework.

## Cost note

This performs live model and research calls. A successful run can incur OpenAI API usage and a real Industrial Platform / Apify Actor run.

## Security

Do not commit `OPENAI_API_KEY` or `APIFY_TOKEN`.

Keep credentials in environment variables, secret stores, or your deployment platform's secure configuration.
