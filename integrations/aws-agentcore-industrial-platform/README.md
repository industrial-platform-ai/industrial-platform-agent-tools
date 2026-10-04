# Industrial Platform — AWS AgentCore Gateway

Register Industrial Platform as a persistent first-party OpenAPI target in an Amazon Bedrock AgentCore Gateway.

This is the direct-registration channel. It does not depend on Coinbase Bazaar selection.

## What it does

`install.py`:

1. downloads Industrial Platform's current production OpenAPI document;
2. validates that it is OpenAPI 3.x;
3. uploads the exact schema to an operator-owned S3 bucket;
4. searches the configured AgentCore Gateway for a target named `IndustrialPlatform`;
5. creates the target if absent, or updates the existing target in place if already installed.

AgentCore documents `CreateGatewayTarget`, `ListGatewayTargets` and `UpdateGatewayTarget`, so this process can be re-run when Industrial Platform adds or changes tools without creating duplicate targets.

## Prerequisites

- an existing Amazon Bedrock AgentCore Gateway;
- AWS credentials for the operator/account that owns that Gateway;
- an S3 bucket in the operator's account for the OpenAPI schema;
- Boto3 and requests.

```bash
pip install boto3 requests
```

## One-command install / refresh

After authenticating the AWS CLI/SDK identity that owns the Gateway, set the two required values and run:

```bash
export AWS_REGION=us-west-2
export AGENTCORE_GATEWAY_ID='your-gateway-id'
export AGENTCORE_SCHEMA_BUCKET='your-schema-bucket'

curl -fsSL https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/aws-agentcore-industrial-platform/bootstrap.sh | bash
```

The bootstrap creates a temporary Python virtual environment, installs `boto3` and `requests`, downloads the idempotent installer, runs it, and deletes the temporary environment.

No long-lived Industrial Platform credential is required. The AWS caller's existing IAM authorization controls whether the Gateway target can be created or updated.

Optional:

```bash
export AGENTCORE_TARGET_NAME=IndustrialPlatform
export INDUSTRIAL_PLATFORM_OPENAPI=https://x402-gateway-production-1f21.up.railway.app/openapi.json
```

Re-run the same command after Industrial Platform publishes new operations. The installer updates the existing target by name.

## Payments

The Gateway target only establishes persistent tool availability. Paid execution uses Amazon Bedrock AgentCore Payments.

AgentCore's documented x402 flow is:

1. agent invokes the Gateway tool;
2. Industrial Platform returns HTTP 402;
3. AgentCore Payments checks the active payment-session budget;
4. AgentCore signs the x402 payment using the configured payment instrument;
5. the request is retried with the payment proof;
6. Industrial Platform returns the paid result.

Configure a PaymentManager, connector/payment instrument and payment session according to AWS AgentCore Payments documentation. Industrial Platform never receives the buyer's wallet secret.

## Why OpenAPI rather than Bazaar

This target points directly at Industrial Platform's HTTP API schema. Once installed, the Gateway has Industrial Platform as a first-party target and does not need to discover or select Industrial Platform from Coinbase Bazaar for these tools.

Bazaar remains useful in parallel for broad discovery by agents that have not installed this direct target.


## Automatic x402 payments with LangGraph

For an AgentCore/LangGraph runtime, this integration includes:

`integrations/aws-agentcore-industrial-platform/langgraph_payments.py`

Set:

```bash
export AGENTCORE_PAYMENT_MANAGER_ARN='arn:aws:bedrock-agentcore:...:payment-manager/...'
export AGENTCORE_PAYMENT_INSTRUMENT_ID='payment-instrument-...'
export AGENTCORE_PAYMENT_USER_ID='industrial-platform-agent'
export AGENTCORE_PAYMENT_MAX_SPEND='5.00'
export AWS_REGION='us-west-2'
```

Then:

```python
from langgraph_payments import industrial_platform_payments

payments = industrial_platform_payments()

agent = create_agent(
    model=...,
    tools=...,
    middleware=[payments],
)
```

The helper configures AgentCore Payments with:

- automatic x402 processing enabled;
- automatic payment-session creation;
- the operator-set maximum session spend;
- Base mainnet (`eip155:8453`) as the preferred payment network;
- the operator's existing AgentCore payment instrument.

The payment instrument and Payment Manager remain operator-owned AWS resources. Industrial Platform never receives those credentials.

This completes the intended direct path:

```text
AgentCore Gateway target (IndustrialPlatform)
        -> Industrial Platform tool
        -> HTTP 402
        -> AgentCore Payments middleware
        -> Base USDC proof
        -> paid retry
        -> Industrial Platform response
```
