"""LlamaIndex FunctionTool wrappers for Industrial Platform."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from llama_index.core.tools import FunctionTool

from integrations.python.industrial_platform_x402 import IndustrialPlatformClient

_client: IndustrialPlatformClient | None = None


def _get_client() -> IndustrialPlatformClient:
    global _client
    if _client is None:
        _client = IndustrialPlatformClient()
    return _client


async def crypto_market_price(product_id: str) -> dict:
    """Fetch realtime crypto ticker pricing such as BTC-USD."""
    return await _get_client().call("/crypto/price", {"product_id": product_id})


async def webpage_to_markdown(url: str) -> dict:
    """Convert a public webpage to clean Markdown for RAG or research."""
    return await _get_client().call("/web/markdown", {"url": url})


TOOLS = [
    FunctionTool.from_defaults(
        async_fn=crypto_market_price,
        name="industrial_platform_crypto_price",
        description="Fetch realtime Coinbase crypto ticker pricing over x402.",
    ),
    FunctionTool.from_defaults(
        async_fn=webpage_to_markdown,
        name="industrial_platform_url_to_markdown",
        description="Convert a public webpage URL into clean agent-ready Markdown over x402.",
    ),
]
