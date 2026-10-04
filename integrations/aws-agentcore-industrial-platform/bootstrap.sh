#!/usr/bin/env bash
set -euo pipefail

: "${AGENTCORE_GATEWAY_ID:?Set AGENTCORE_GATEWAY_ID}"
: "${AGENTCORE_SCHEMA_BUCKET:?Set AGENTCORE_SCHEMA_BUCKET}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

python3 -m venv "$tmpdir/venv"
"$tmpdir/venv/bin/python" -m pip install --quiet --disable-pip-version-check boto3 requests

curl -fsSL   https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/aws-agentcore-industrial-platform/install.py   -o "$tmpdir/install.py"

exec "$tmpdir/venv/bin/python" "$tmpdir/install.py"
