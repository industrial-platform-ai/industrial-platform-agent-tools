#!/usr/bin/env python3
"""
Idempotently register Industrial Platform as an Amazon Bedrock AgentCore Gateway
OpenAPI target.

Requirements:
  pip install boto3 requests

Environment:
  AWS_REGION               default: us-west-2
  AGENTCORE_GATEWAY_ID     required
  AGENTCORE_SCHEMA_BUCKET  required
  AGENTCORE_TARGET_NAME    default: IndustrialPlatform
  INDUSTRIAL_PLATFORM_OPENAPI
                           default: https://x402-gateway-production-1f21.up.railway.app/openapi.json

The caller's AWS identity must be allowed to:
  - s3:PutObject on the schema object
  - bedrock-agentcore:ListGatewayTargets
  - bedrock-agentcore:CreateGatewayTarget
  - bedrock-agentcore:UpdateGatewayTarget
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from urllib.parse import urlparse

import boto3
import requests


REGION = os.getenv("AWS_REGION", "us-west-2")
GATEWAY_ID = os.getenv("AGENTCORE_GATEWAY_ID", "").strip()
BUCKET = os.getenv("AGENTCORE_SCHEMA_BUCKET", "").strip()
TARGET_NAME = os.getenv("AGENTCORE_TARGET_NAME", "IndustrialPlatform").strip()
OPENAPI_URL = os.getenv(
    "INDUSTRIAL_PLATFORM_OPENAPI",
    "https://x402-gateway-production-1f21.up.railway.app/openapi.json",
).strip()

if not GATEWAY_ID:
    sys.exit("AGENTCORE_GATEWAY_ID is required")
if not BUCKET:
    sys.exit("AGENTCORE_SCHEMA_BUCKET is required")
if not TARGET_NAME:
    sys.exit("AGENTCORE_TARGET_NAME must not be empty")

response = requests.get(OPENAPI_URL, timeout=30)
response.raise_for_status()
schema = response.json()

# Validate the minimum OpenAPI shape before publishing.
if not isinstance(schema, dict) or not str(schema.get("openapi", "")).startswith("3."):
    sys.exit("Industrial Platform did not return an OpenAPI 3.x document")
paths = schema.get("paths")
if not isinstance(paths, dict) or not paths:
    sys.exit("Industrial Platform OpenAPI document contains no paths")

encoded = json.dumps(schema, separators=(",", ":"), sort_keys=True).encode()
digest = hashlib.sha256(encoded).hexdigest()
key = f"industrial-platform-agentcore/openapi-{digest[:16]}.json"

s3 = boto3.client("s3", region_name=REGION)
sts = boto3.client("sts", region_name=REGION)
control = boto3.client("bedrock-agentcore-control", region_name=REGION)

account_id = sts.get_caller_identity()["Account"]
s3.put_object(
    Bucket=BUCKET,
    Key=key,
    Body=encoded,
    ContentType="application/json",
)
schema_uri = f"s3://{BUCKET}/{key}"

target_configuration = {
    "mcp": {
        "openApiSchema": {
            "s3": {
                "uri": schema_uri,
                "bucketOwnerAccountId": account_id,
            }
        }
    }
}

description = (
    "Industrial Platform native x402 web and crypto-agent APIs; "
    "wallet monitoring, treasury, pre-trade and transaction workflows."
)

# Exhaustively locate an existing target with the same name.
items = []
token = None
while True:
    kwargs = {"gatewayIdentifier": GATEWAY_ID, "maxResults": 1000}
    if token:
        kwargs["nextToken"] = token
    page = control.list_gateway_targets(**kwargs)
    items.extend(page.get("items", []))
    token = page.get("nextToken")
    if not token:
        break

matches = [item for item in items if item.get("name") == TARGET_NAME]
if len(matches) > 1:
    sys.exit(f"Multiple AgentCore targets named {TARGET_NAME!r}; refusing to guess")

if matches:
    current = matches[0]
    status = current.get("status")
    if status in {"CREATE_PENDING_AUTH", "UPDATE_PENDING_AUTH", "SYNCHRONIZE_PENDING_AUTH"}:
        sys.exit(f"Target {TARGET_NAME!r} is in pending authorization state: {status}")
    result = control.update_gateway_target(
        gatewayIdentifier=GATEWAY_ID,
        targetId=current["targetId"],
        name=TARGET_NAME,
        description=description,
        targetConfiguration=target_configuration,
    )
    action = "updated"
else:
    result = control.create_gateway_target(
        gatewayIdentifier=GATEWAY_ID,
        name=TARGET_NAME,
        description=description,
        targetConfiguration=target_configuration,
    )
    action = "created"

print(json.dumps({
    "ok": True,
    "action": action,
    "gatewayIdentifier": GATEWAY_ID,
    "targetName": TARGET_NAME,
    "targetId": result.get("targetId"),
    "status": result.get("status"),
    "schemaUri": schema_uri,
    "schemaSha256": digest,
    "openApiSource": OPENAPI_URL,
}, indent=2, default=str))
