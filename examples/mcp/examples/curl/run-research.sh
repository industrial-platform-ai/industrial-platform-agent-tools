#!/usr/bin/env bash

set -euo pipefail

if [ -z "${APIFY_TOKEN:-}" ]; then
  echo "Error: APIFY_TOKEN is not set."
  echo "Set it in your environment before running this example."
  exit 1
fi

API_URL="https://api.apify.com/v2/actors/industrial_platform~research-brief-agent/run-sync-get-dataset-items?clean=true&format=json"

curl --fail-with-body \
  --silent \
  --show-error \
  --location \
  --request POST \
  "$API_URL" \
  --header "Authorization: Bearer ${APIFY_TOKEN}" \
  --header "Content-Type: application/json" \
  --header "Accept: application/json" \
  --data '{
    "research_question": "Compare HubSpot CRM, Pipedrive, and Zoho CRM for a five-person small business.",
    "context": "The business needs predictable pricing, automation, integrations, and straightforward administration.",
    "requirements": "Use current authoritative sources. Include a comparison table, cite sources, identify pricing caveats, and state unresolved facts."
  }'
