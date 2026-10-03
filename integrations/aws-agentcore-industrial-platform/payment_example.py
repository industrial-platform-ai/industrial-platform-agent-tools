"""Minimal AgentCore Payments pattern for a directly registered Industrial Platform target.

This file intentionally does not create wallets or payment instruments. It shows the
operator-side configuration boundary expected after the Gateway target is installed.
"""
import os

from bedrock_agentcore.payments import PaymentManager

PAYMENT_MANAGER_ARN = os.environ["AGENTCORE_PAYMENT_MANAGER_ARN"]
PAYMENT_INSTRUMENT_ID = os.environ["AGENTCORE_PAYMENT_INSTRUMENT_ID"]
USER_ID = os.environ.get("AGENTCORE_PAYMENT_USER_ID", "industrial-platform-agent")

manager = PaymentManager(
    payment_manager_arn=PAYMENT_MANAGER_ARN,
    region_name=os.environ.get("AWS_REGION", "us-west-2"),
)

def payment_headers(payment_required_request: dict, payment_session_id: str, client_token: str):
    """Return signed headers after the caller has received Industrial Platform's 402."""
    return manager.generate_payment_header(
        user_id=USER_ID,
        payment_instrument_id=PAYMENT_INSTRUMENT_ID,
        payment_session_id=payment_session_id,
        payment_required_request=payment_required_request,
        client_token=client_token,
    )
