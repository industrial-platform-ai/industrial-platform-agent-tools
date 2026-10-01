"""Crypto market intelligence workflow using Industrial Platform x402."""

from __future__ import annotations

import asyncio
import json
import sys

from integrations.python.industrial_platform_x402 import IndustrialPlatformClient


async def run(product_id: str) -> dict:
    client = IndustrialPlatformClient(max_payment_usd="$0.02")

    ticker, stats, book = await asyncio.gather(
        client.call("/crypto/price", {"product_id": product_id}),
        client.call("/crypto/stats", {"product_id": product_id}),
        client.call("/crypto/book", {"product_id": product_id}),
    )

    return {
        "product_id": product_id,
        "ticker": ticker,
        "stats_24h": stats,
        "top_of_book": book,
    }


if __name__ == "__main__":
    product = sys.argv[1] if len(sys.argv) > 1 else "BTC-USD"
    print(json.dumps(asyncio.run(run(product)), indent=2))
