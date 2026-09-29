# Industrial Platform Autonomous Revenue Initiative

## Objective

Build and scale machine-callable products that can generate revenue with minimal ongoing human operation.

The development loop is:

identify machine need → generate product → test → deploy → publish → measure external paid usage → kill, improve, or clone

The human operator should intervene only when a provider requires a human-controlled action.

## Continue-driven operating protocol

The normal user instruction is `continue`.

On each continuation, ChatGPT should perform every available engineering and configuration action that can be completed safely with connected tools before returning another manual gate.

ChatGPT-owned work includes product and competitor research; architecture and implementation; GitHub branches, files, pull requests, issues, and documentation; schemas and machine contracts; automated tests and CI; deployment workflows; integration examples; MCP wrappers; bug investigation and fixes; release preparation; measurement scripts; growth milestone automation; and successive product development.

Human-owned gates include KYC or identity verification, account creation, accepting provider terms, adding or rotating secret credentials, payout and banking information, payment-card actions, OAuth/provider approval screens that require the account owner, and publication or monetization approvals explicitly reserved for a human.

Secrets should never be pasted into chat. They should be entered directly into the relevant provider's secret store.

## Product portfolio

### Product 1 — Research Brief Agent

Status: live / collecting market evidence.

Development rule: do not add infrastructure unless actual usage exposes a problem or a demand signal justifies expansion.

### Product 2 — Web Change Intelligence

Status: implementation complete; deployment automation being established.

Primary PPE event: `page-comparison`.

Machine use cases include price changes, inventory and availability changes, policy or terms changes, documentation changes, competitor-page changes, and structured endpoint changes.

The implementation is deterministic and does not require an LLM per execution.

## Revenue milestones

For Web Change Intelligence, one successful external paid run produces one `page-comparison` event. Internal owner runs are excluded from growth milestones.

### Milestone A — first external paid event

Success condition: external page-comparison events >= 1.

Action: confirm the run was genuinely external; inspect origin and use pattern; verify execution cost and event price; preserve the successful path; begin looking for adjacent demand.

### Milestone B — 10 external paid events

Success condition: external page-comparison events >= 10.

Action: measure unique external users and repeat usage; identify the strongest invocation pattern; improve Store copy and machine-facing metadata around demonstrated demand; consider cloning the capability into one narrow adjacent Actor.

### Milestone C — 100 external paid events

Success condition: external page-comparison events >= 100.

Action: analyze retention and repeat-call concentration; optimize pricing and compute efficiency; invest more engineering only where usage data supports it; use the winning pattern to select Product #3 or a specialized variant.

## Product selection rule

A new product should usually be machine-consumable, recurring, human-free at fulfillment time, low marginal cost, narrow enough for agent discovery, supported by market evidence, independently deployable/measurable, and isolated from the rest of the portfolio.

## Kill / expand rule

Expand products that show external paid usage, repeat users, integration activity, or strong discovery signals. Freeze or kill products that receive no meaningful external activity after a reasonable discovery period unless a specific distribution experiment remains worth running.

## Automation architecture

ChatGPT/GitHub → implementation + tests → GitHub Actions → Apify deploy + smoke test → Store/MCP discovery → external paid calls → Apify run telemetry → milestone monitor → 1 → 10 → 100 paid events → improve/clone/Product #3.

## Current human gate

The repository requires a GitHub Actions secret named `APIFY_TOKEN`.

Once that secret exists and the deployment workflow is on the default branch, GitHub can deploy and smoke-test Web Change Intelligence without local Git, PowerShell navigation, or a downloaded ZIP.
