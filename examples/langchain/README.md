# LangChain / LangGraph integration

This example exposes Industrial Platform as ordinary LangChain tools while the
x402 client handles HTTP 402 payment negotiation automatically.

## Install

```bash
python -m pip install -r requirements.txt
```

Set a funded Base wallet key in your local environment:

```bash
export EVM_PRIVATE_KEY=0x...
```

Never commit the key. The wallet belongs to the external caller; successful
tool invocations settle USDC directly to Industrial Platform's published Base
`payTo` address.

## Use

```python
from examples.langchain.industrial_platform_tools import TOOLS

# Bind TOOLS to any LangChain/LangGraph chat model or agent.
# Tool selection remains up to the parent agent.
```

Included task-match tools:

- SHA-256 checksum
- realtime crypto ticker pricing
- URL-to-Markdown
- deterministic webpage change detection

The free live catalog is available at:

```text
https://x402-gateway-production-1f21.up.railway.app/.well-known/x402
```
