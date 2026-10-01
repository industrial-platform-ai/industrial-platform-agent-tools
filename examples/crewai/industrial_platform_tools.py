"""CrewAI custom tools backed by Industrial Platform x402 services."""

from __future__ import annotations

import asyncio

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from integrations.python.industrial_platform_x402 import IndustrialPlatformClient


class CryptoPriceInput(BaseModel):
    product_id: str = Field(..., description="Coinbase pair such as BTC-USD or ETH-USD")


class UrlInput(BaseModel):
    url: str = Field(..., description="Public HTTP(S) URL")


class CryptoPriceTool(BaseTool):
    name: str = "industrial_platform_crypto_price"
    description: str = (
        "Fetch realtime Coinbase crypto ticker pricing through Industrial Platform."
    )
    args_schema: type[BaseModel] = CryptoPriceInput

    def _run(self, product_id: str) -> dict:
        return asyncio.run(
            IndustrialPlatformClient().call(
                "/crypto/price", {"product_id": product_id}
            )
        )


class UrlToMarkdownTool(BaseTool):
    name: str = "industrial_platform_url_to_markdown"
    description: str = (
        "Convert a public webpage URL into clean agent-ready Markdown for research or RAG."
    )
    args_schema: type[BaseModel] = UrlInput

    def _run(self, url: str) -> dict:
        return asyncio.run(
            IndustrialPlatformClient().call("/web/markdown", {"url": url})
        )


TOOLS = [CryptoPriceTool(), UrlToMarkdownTool()]
