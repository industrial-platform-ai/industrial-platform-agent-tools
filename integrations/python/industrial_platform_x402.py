"""Reusable x402 client for Industrial Platform's Base gateway.

External users supply their own EVM_PRIVATE_KEY. The client discovers the live
catalog for free and pays only when a protected tool is actually invoked.
"""

from __future__ import annotations

import os
from typing import Any

from eth_account import Account
from x402 import x402Client
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

GATEWAY = os.getenv(
    "INDUSTRIAL_PLATFORM_GATEWAY",
    "https://x402-gateway-production-1f21.up.railway.app",
).rstrip("/")


class IndustrialPlatformClient:
    def __init__(self, private_key: str | None = None, max_payment_usd: str = "$0.01"):
        key = private_key or os.getenv("EVM_PRIVATE_KEY")
        if not key:
            raise ValueError("EVM_PRIVATE_KEY is required for paid x402 calls.")

        account = Account.from_key(key)
        self.address = account.address
        self._client = x402Client().set_spend_controls(
            {"max_amount_per_payment": max_payment_usd}
        )
        register_exact_evm_client(self._client, EthAccountSigner(account))

    async def catalog(self) -> dict[str, Any]:
        """Fetch the free machine-readable seller manifest."""
        import httpx

        async with httpx.AsyncClient(timeout=20) as http:
            response = await http.get(f"{GATEWAY}/.well-known/x402")
            response.raise_for_status()
            return response.json()

    async def call(self, route: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Invoke one paid Industrial Platform tool over x402."""
        if not route.startswith("/"):
            route = "/" + route

        async with x402HttpxClient(self._client) as http:
            response = await http.post(
                f"{GATEWAY}{route}",
                json=payload,
                timeout=30,
            )
            await response.aread()
            response.raise_for_status()
            return response.json()
