"""Coinbase AgentKit integration for Industrial Platform x402 tools."""

from __future__ import annotations

import os

from eth_account import Account
from coinbase_agentkit import (
    AgentKit,
    AgentKitConfig,
    EthAccountWalletProvider,
    EthAccountWalletProviderConfig,
    X402Config,
    x402_action_provider,
)

GATEWAY = os.getenv(
    "INDUSTRIAL_PLATFORM_GATEWAY",
    "https://x402-gateway-production-1f21.up.railway.app",
).rstrip("/")


def build_wallet_provider() -> EthAccountWalletProvider:
    """Create a Base mainnet wallet provider from EVM_PRIVATE_KEY."""
    private_key = os.getenv("EVM_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("EVM_PRIVATE_KEY is required.")
    if not private_key.startswith("0x"):
        raise RuntimeError("EVM_PRIVATE_KEY must use the 0x-prefixed EVM format.")

    account = Account.from_key(private_key)
    return EthAccountWalletProvider(
        config=EthAccountWalletProviderConfig(
            account=account,
            chain_id="8453",
        )
    )


def build_x402_provider(max_payment_usdc: float = 0.01):
    """Create AgentKit's native x402 provider, locked to Industrial Platform."""
    return x402_action_provider(
        X402Config(
            registered_services=[GATEWAY],
            allow_dynamic_service_registration=False,
            max_payment_usdc=max_payment_usdc,
        )
    )


def build_agentkit(max_payment_usdc: float = 0.01) -> AgentKit:
    """Build a Base AgentKit instance that can pay Industrial Platform over x402.

    The caller owns the wallet and controls the spend ceiling. Industrial Platform
    is pre-registered so this provider cannot pay arbitrary hosts.
    """
    wallet_provider = build_wallet_provider()
    return AgentKit(
        AgentKitConfig(
            wallet_provider=wallet_provider,
            action_providers=[build_x402_provider(max_payment_usdc)],
        )
    )
