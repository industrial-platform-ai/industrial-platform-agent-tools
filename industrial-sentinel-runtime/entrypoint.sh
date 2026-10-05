#!/bin/sh
set -eu

STATE_DIR="${OPENCLAW_STATE_DIR:-/home/node/.openclaw}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$STATE_DIR/openclaw.json}"
PAYER_URL="http://127.0.0.1:${SENTINEL_PAYER_PORT:-8403}/x402-fetch"
MAX_DAILY="${SENTINEL_MAX_DAILY_USD:-5}"
MARKET_INTERVAL="${SENTINEL_MARKET_INTERVAL_SECONDS:-60}"
PRODUCT_ID="${SENTINEL_PRODUCT_ID:-BTC-USD}"
PORT_VALUE="${PORT:-18789}"

mkdir -p "$STATE_DIR"

if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  OPENCLAW_GATEWAY_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  export OPENCLAW_GATEWAY_TOKEN
  printf '%s\n' "$OPENCLAW_GATEWAY_TOKEN" > "$STATE_DIR/generated-gateway-token"
  chmod 600 "$STATE_DIR/generated-gateway-token"
  echo "Generated OpenClaw gateway token at $STATE_DIR/generated-gateway-token"
fi

ENABLED=false
if printf '%s' "${SENTINEL_EVM_PRIVATE_KEY:-}" | grep -Eq '^0x[0-9a-fA-F]{64}$'; then
  ENABLED=true
fi

if [ -n "${SENTINEL_JOBS_JSON:-}" ]; then
  JOBS_JSON="$SENTINEL_JOBS_JSON"
else
  JOBS_JSON="$(node -e '
    const jobs=[{
      id:"market-btc",
      kind:"market-snapshot",
      intervalSeconds:Math.max(15,Number(process.env.SENTINEL_MARKET_INTERVAL_SECONDS||60)),
      input:{product_id:process.env.SENTINEL_PRODUCT_ID||"BTC-USD"}
    }];
    const address=(process.env.SENTINEL_WALLET_ADDRESS||"").trim();
    if(/^0x[0-9a-fA-F]{40}$/.test(address)) jobs.push({
      id:"treasury",
      kind:"treasury-snapshot",
      intervalSeconds:Math.max(60,Number(process.env.SENTINEL_TREASURY_INTERVAL_SECONDS||300)),
      input:{address}
    });
    const url=(process.env.SENTINEL_WEB_URL||"").trim();
    if(/^https?:\/\//.test(url)) jobs.push({
      id:"web-change",
      kind:"web-change",
      intervalSeconds:Math.max(60,Number(process.env.SENTINEL_WEB_INTERVAL_SECONDS||300)),
      input:{url,include_current_text:false}
    });
    process.stdout.write(JSON.stringify(jobs));
  ')"
fi

node - "$CONFIG_PATH" "$PAYER_URL" "$MAX_DAILY" "$JOBS_JSON" "$ENABLED" <<'NODE'
const fs=require('fs');
const [configPath,payerAdapterUrl,maxDailyRaw,jobsRaw,enabledRaw]=process.argv.slice(2);
const config={
  gateway:{mode:'local'},
  plugins:{
    load:{paths:['/opt/industrial-sentinel']},
    entries:{
      'industrial-sentinel':{
        enabled:enabledRaw==='true',
        config:{
          payerAdapterUrl,
          maxDailyUsd:Number(maxDailyRaw),
          jobs:JSON.parse(jobsRaw)
        }
      }
    }
  }
};
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
NODE

node /opt/industrial-payer/payer-adapter.mjs &
PAYER_PID=$!
trap 'kill "$PAYER_PID" 2>/dev/null || true' INT TERM EXIT

if [ "$ENABLED" = "true" ]; then
  echo "Industrial Sentinel enabled with bounded x402 payer."
else
  echo "Industrial Sentinel payments disabled: set SENTINEL_EVM_PRIVATE_KEY to an operator-owned funded Base wallet secret."
fi

exec openclaw gateway run --bind lan --port "$PORT_VALUE"
