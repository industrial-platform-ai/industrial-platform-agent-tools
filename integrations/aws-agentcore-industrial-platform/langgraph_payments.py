"""AgentCore LangGraph auto-payment middleware for Industrial Platform.

Environment:
  AGENTCORE_PAYMENT_MANAGER_ARN      required
  AGENTCORE_PAYMENT_INSTRUMENT_ID   required
  AGENTCORE_PAYMENT_USER_ID         default: industrial-platform-agent
  AGENTCORE_PAYMENT_MAX_SPEND       default: 5.00
  AWS_REGION                        default: us-west-2

Usage:
  from langgraph_payments import industrial_platform_payments
  payments = industrial_platform_payments()
  agent = create_agent(..., middleware=[payments])
"""
from __future__ import annotations

import os


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def industrial_platform_payments():
    from bedrock_agentcore.payments.integrations.langgraph import (
        AgentCorePaymentsConfig,
        AgentCorePaymentsMiddleware,
    )

    config = AgentCorePaymentsConfig(
        payment_manager_arn=_required("AGENTCORE_PAYMENT_MANAGER_ARN"),
        user_id=os.getenv("AGENTCORE_PAYMENT_USER_ID", "industrial-platform-agent"),
        payment_instrument_id=_required("AGENTCORE_PAYMENT_INSTRUMENT_ID"),
        region=os.getenv("AWS_REGION", "us-west-2"),
        auto_session=True,
        auto_session_max_spend=os.getenv("AGENTCORE_PAYMENT_MAX_SPEND", "5.00"),
        auto_session_currency="USD",
        auto_payment=True,
        network_preferences_config=["eip155:8453"],
        agent_name="industrial-platform-agent",
    )
    return AgentCorePaymentsMiddleware(config)
