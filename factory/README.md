# Bounded Autonomous Service Factory

## What is implemented

A GitHub Actions scheduler runs hourly on the default branch once merged. It inspects existing production HTTP payment metrics and ranks three **distinct** additional pretested products. It does **not** execute x402 payments, trigger verifiers, call third-party target URLs, or create artificial discovery events. Each hourly report is saved as a downloadable Actions artifact.

The factory's disabled-by-default catalog comprises:
- `/factory/verification-preflight`: operator-authorized endpoint HEAD plus payment preflight; $0.004 if activated.
- `/factory/receipt-finality`: correlated onchain USDC receipt and transaction finality; $0.005.
- `/factory/multi-site-change`: two or three bounded public site-change checks; $0.009.

Each product delegates to existing SSRF-screened or chain/network handlers in the paid HTTP gateway and uses the existing x402/Base USDC seller configuration. MCP exposes exactly the same activated tools. No additional Railway project or compute fleet is required.

## Important limits

The generator prototype's 80 combinatorial variants are **not** 80 valuable or verified services. No identical-route aliases or content-free products may be activated merely to solicit verification probes.

The hourly runner currently only **ranks and reports** candidates. Promotion is deliberately denied by default because `/metrics/x402.json` has no independently verified customer-production-purpose attribution and resets on gateway deployment. Bot user-agent heuristics are not proof of independence. We cannot equate every 402 probe or 2xx request with an organic sale.

Automatic release may be enabled in a later phase only once the runtime has auditable:
1. Settled correct-payee Base USDC transfers matched to successful HTTP paid execution.
2. Exclusion of internal, funded validation, friend, verifier-only, bounty and circular payments from **production** demand.
3. Repeated real production demand for the selected distinct output, including another UTC day, quality tests and observed positive variable margin.
4. Per-hour (max 1) and daily limits (max 3), safe approvals/cost caps, 24-hour rollback, and stop after seven days or ten qualified unsuccessful approaches.

Verification receipts from authentic auditors may be disclosed in a separate accounting column, never represented as repeat production customer revenue. Legitimate one-off QA payments are not guaranteed when new endpoints are published.

## How to use

Review the `Industrial Platform Bounded Hourly Factory` GitHub Actions workflow result and its `factory-hourly-report` artifact. Scheduled workflows run on the default branch only and are subject to GitHub scheduling delays. The existing Industrial Platform Autonomous Revenue task is separate and should remain enabled. It should not duplicate this job.

Before production promotion, confirm the live payee against the supported Coinbase Base USDC receive address. Product prices represent gross seller fees, not proven net profit.
