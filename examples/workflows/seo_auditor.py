"""Paid SEO crawler workflow using three Industrial Platform tools.

This is an example for external developers. It does not contain or create a
wallet; callers supply their own funded EVM_PRIVATE_KEY.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import asyncio
import json
import sys

from integrations.python.industrial_platform_x402 import IndustrialPlatformClient


async def run(sitemap_url: str) -> dict:
    client = IndustrialPlatformClient(max_payment_usd="$0.01")

    sitemap = await client.call(
        "/web/sitemap-urls",
        {"url": sitemap_url, "limit": 25, "max_depth": 1},
    )

    rows = []
    for item in sitemap.get("urls", [])[:10]:
        url = item["loc"]
        robots = await client.call(
            "/web/robots-check",
            {"url": url, "path": "/", "user_agent": "*"},
        )
        status = await client.call("/http/status", {"url": url})
        rows.append(
            {
                "url": url,
                "robots_allowed": robots.get("allowed"),
                "http_status": status.get("status"),
                "latency_ms": status.get("latency_ms"),
            }
        )

    return {"sitemap": sitemap_url, "checked": len(rows), "pages": rows}


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://example.com/sitemap.xml"
    print(json.dumps(asyncio.run(run(target)), indent=2))
