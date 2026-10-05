from __future__ import annotations

import json

from aimarket_hub.api import create_app
from aimarket_hub.config import HubConfig
from aimarket_hub.database import HubDatabase
from aimarket_hub.models import Capability

config = HubConfig()
db = HubDatabase(config.db_path, database_url=config.database_url)

INSTALL_BUNDLE = {
    "provider": "Industrial Platform",
    "artifact": "Industrial Sentinel",
    "version": "0.2.0",
    "purpose": "Install-once recurring wallet, treasury, transaction and payment monitoring for authorized funded agents.",
    "container": "ghcr.io/industrial-platform-ai/industrial-sentinel-runtime:latest",
    "openclaw": {
        "command": "openclaw plugins install industrial-sentinel --marketplace industrial-platform-ai/industrial-platform-agent-tools"
    },
    "agent_skill": {
        "repository": "https://github.com/industrial-platform-ai/industrial-platform-agent-tools",
        "path": "skills/industrial-sentinel",
        "install_command": "npx skills add https://github.com/industrial-platform-ai/industrial-platform-agent-tools --skill industrial-sentinel -y"
    },
    "authorization": {
        "requires_operator_install_authority": True,
        "requires_operator_owned_funded_base_wallet_for_paid_cycles": True,
        "never_bypass_permission_controls": True
    },
    "payment": {
        "protocol": "x402",
        "network": "Base",
        "asset": "USDC",
        "daily_cap_env": "SENTINEL_MAX_DAILY_USD"
    },
    "recurring_jobs": [
        {"kind": "wallet-monitor", "route": "/agent/wallet-monitor", "max_usd": 0.005},
        {"kind": "transaction-watch", "route": "/agent/transaction-watch", "max_usd": 0.003},
        {"kind": "treasury-snapshot", "route": "/agent/treasury-snapshot", "max_usd": 0.01},
        {"kind": "pretrade-context", "route": "/agent/pretrade", "max_usd": 0.01}
    ]
}

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "provider": {"type": "string"},
        "artifact": {"type": "string"},
        "version": {"type": "string"},
        "container": {"type": "string"},
        "openclaw": {"type": "object"},
        "agent_skill": {"type": "object"},
        "authorization": {"type": "object"},
        "payment": {"type": "object"},
        "recurring_jobs": {"type": "array"}
    }
}

CAPABILITIES = [
    (
        "industrial.sentinel.install@v1",
        "sentinel.install",
        "Install Industrial Sentinel into an authorized always-on agent runtime. Returns a machine-readable container, OpenClaw and Agent Skill bootstrap bundle for continuous wallet, treasury, transaction and payment monitoring."
    ),
    (
        "industrial.sentinel.wallet-monitor-bootstrap@v1",
        "sentinel.wallet-monitor-bootstrap",
        "Bootstrap continuous wallet activity, balance, deposit and outflow monitoring by installing Industrial Sentinel into an authorized funded agent runtime. The installed runtime performs bounded recurring x402 calls."
    ),
    (
        "industrial.sentinel.treasury-monitor-bootstrap@v1",
        "sentinel.treasury-monitor-bootstrap",
        "Bootstrap recurring autonomous treasury snapshots and payment-health monitoring. Intended for always-on funded agents that need a persistent treasury observer rather than a one-shot lookup."
    ),
    (
        "industrial.sentinel.transaction-watch-bootstrap@v1",
        "sentinel.transaction-watch-bootstrap",
        "Bootstrap an always-on transaction watcher that polls until a transaction resolves, under operator-approved installation authority and bounded x402 spend."
    )
]

for capability_id, name, description in CAPABILITIES:
    db.upsert_capability(
        Capability(
            capability_id=capability_id,
            product_id="industrial-sentinel",
            name=name,
            version="v1",
            description=description,
            input_schema={"type": "object", "additionalProperties": True},
            output_schema=OUTPUT_SCHEMA,
            price_per_call_usd=0.0,
            p50_latency_ms=5,
            success_rate_30d=1.0,
            source_hub="local",
            source_hub_name=config.hub_name,
            trust_score=0.95,
            prompt_template=json.dumps(INSTALL_BUNDLE, separators=(",", ":"), sort_keys=True),
            is_demo=False,
        )
    )

app = create_app(config=config, db=db)
