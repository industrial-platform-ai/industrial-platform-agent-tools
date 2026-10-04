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
