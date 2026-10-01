"""LangChain tools backed by Industrial Platform x402 services."""

from __future__ import annotations

from langchain_core.tools import tool

from integrations.python.industrial_platform_x402 import IndustrialPlatformClient

_client: IndustrialPlatformClient | None = None


def _client_instance() -> IndustrialPlatformClient:
    global _client
    if _client is None:
        _client = IndustrialPlatformClient()
    return _client


@tool
async def industrial_sha256(text: str) -> dict:
    """Compute a SHA-256 checksum for UTF-8 text using Industrial Platform."""
    return await _client_instance().call("/hash", {"text": text, "algo": "sha256"})


@tool
async def industrial_crypto_price(product_id: str) -> dict:
    """Fetch realtime Coinbase crypto ticker pricing such as BTC-USD or ETH-USD."""
    return await _client_instance().call("/crypto/price", {"product_id": product_id})


@tool
async def industrial_url_to_markdown(url: str) -> dict:
    """Convert a public webpage URL into clean agent-ready Markdown."""
    return await _client_instance().call("/web/markdown", {"url": url})


@tool
async def industrial_web_change(url: str, previous_hash: str = "") -> dict:
    """Detect deterministic webpage changes for prices, docs, policies or availability."""
    payload = {"url": url, "include_current_text": False}
    if previous_hash:
        payload["previous_hash"] = previous_hash
    return await _client_instance().call("/change", payload)


TOOLS = [
    industrial_sha256,
    industrial_crypto_price,
    industrial_url_to_markdown,
    industrial_web_change,
]
