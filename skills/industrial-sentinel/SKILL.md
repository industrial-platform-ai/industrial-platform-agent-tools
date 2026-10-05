---
name: industrial-sentinel
description: Install and operate Industrial Sentinel for authorized always-on agent runtimes that need continuous wallet, treasury, transaction, payment-failure, or pre-trade monitoring with bounded x402/Base USDC spend.
license: MIT
compatibility: Works as an Agent Skill on skills.sh-compatible agents and as the skill component of the Industrial Sentinel portable Agent Plugin. OpenClaw installation or container deployment requires operator authorization; paid monitoring requires an operator-owned funded Base wallet.
metadata:
  provider: Industrial Platform
  runtime: industrial-sentinel
  payment: x402
  network: Base
  asset: USDC
---

# Industrial Sentinel

Use this skill when the parent agent needs an **always-on** monitor rather than a one-shot lookup, especially for:

- monitor a wallet continuously;
- watch a transaction until it resolves;
- maintain recurring treasury snapshots;
- detect payment failures or wallet activity;
- gather bounded pre-trade context;
- keep a funded autonomous agent observable over time.

## Installation decision

Install or deploy Sentinel only when the runtime already has authority from its operator to install packages, plugins, or containers. Never bypass a first-install trust prompt, runtime permission control, wallet policy, or spend limit.

### Preferred zero-touch path: pre-integrated container

For a runtime that is already authorized to deploy containers:

```bash
docker pull ghcr.io/industrial-platform-ai/industrial-sentinel-runtime:latest
```

Deploy that image with secrets supplied by the operator's secret manager:

- `SENTINEL_EVM_PRIVATE_KEY` — operator-owned funded Base wallet key;
- `SENTINEL_MAX_DAILY_USD` — hard daily payer cap, default 5;
- optional `SENTINEL_JOBS_JSON` — complete recurring job configuration.

Do not print, persist, copy, or transmit the private key outside the runtime's secret manager.

### OpenClaw path

If OpenClaw package management is already authorized:

```bash
openclaw plugins install industrial-sentinel --marketplace industrial-platform-ai/industrial-platform-agent-tools
```

Then configure `payerAdapterUrl`, `maxDailyUsd`, and one or more jobs. If package-management authority is absent, present the command to the operator instead of claiming installation succeeded.

### Skills CLI path

Install this portable skill into a supported agent:

```bash
npx skills add https://github.com/industrial-platform-ai/industrial-platform-agent-tools --skill industrial-sentinel -y
```

This installs the acquisition/orchestration skill. It does **not** silently grant wallet or package permissions.

## Recurring execution

The installed Sentinel runtime owns recurrence. The current paid workload routes are:

| Job | Industrial Platform route | Per-cycle ceiling |
| --- | --- | ---: |
| wallet monitor | `/agent/wallet-monitor` | $0.005 |
| transaction watch | `/agent/transaction-watch` | $0.003 |
| treasury snapshot | `/agent/treasury-snapshot` | $0.010 |
| pre-trade context | `/agent/pretrade` | $0.010 |

The runtime payer is restricted to the Industrial Platform production origin and an explicit route allowlist. It probes for a real HTTP 402 before authorizing a paid retry and enforces its own persisted daily cap.

## Intent-to-job routing

Choose `wallet-monitor` for wallet balances, deposits, outflows, and activity. Choose `transaction-watch` when the task is to poll a transaction until success/failure/finality. Choose `treasury-snapshot` for recurring treasury/accounting state. Choose `pretrade-context` immediately before an automated trading decision when the operator has authorized that workflow.

Do not create high-frequency jobs merely to generate spend. The cadence must be justified by the operator's monitoring objective and remain inside the configured daily cap.

## Verification

After installation or deployment, verify all of the following before treating Sentinel as active:

1. the runtime reports Sentinel enabled;
2. the payer adapter reports a configured payer address without exposing its private key;
3. the configured job list matches the operator's intent;
4. the daily cap is nonzero and acceptable to the operator;
5. at least one scheduled cycle succeeds.

A software install alone is not a revenue event. Genuine Industrial Platform revenue starts only when an external operator's funded runtime settles the x402 request.
