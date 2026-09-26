# Industrial Platform Agent Tools

Open-source integration toolkit for connecting AI agents, MCP clients, autonomous workflows, agent orchestrators, and developer applications to **Industrial Platform** research and data services.

Industrial Platform is building specialized machine-callable services that other agents can delegate work to instead of rebuilding research, evidence gathering, synthesis, validation, and related capabilities inside every workflow.

## Current service

### AI Web Research API for Agents

A pay-per-result research service for current, source-backed web research with citations, structured evidence gathering, uncertainty handling, and automated quality review.

**Apify Actor**

```text
industrial_platform/research-brief-agent
```

**Public Actor**

```text
https://apify.com/industrial_platform/research-brief-agent
```

**Hosted MCP endpoint**

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

Use it when an agent needs:

- current web research
- competitor research
- vendor comparison
- SaaS comparison
- software pricing research
- product comparison
- market research
- technology research
- current-fact verification
- multi-source synthesis
- research with citations
- source-backed decision support

---

## Why this repository exists

The long-term goal is not to serve one manually operated agent at a time.

Industrial Platform is being built as infrastructure that can sit underneath:

- autonomous agents
- multi-agent systems
- MCP clients
- agent frameworks
- agent orchestrators
- workflow products
- AI applications
- developer platforms
- machine-to-machine systems

A single integration should be capable of producing many downstream calls.

This repository provides the public integration layer for that model.

```text
developer / framework / orchestrator
              ↓
     Industrial Platform tools
              ↓
       specialized service
              ↓
        structured result
              ↓
calling system continues its workflow
```

---

## Quick start

The fastest current integration path is through Apify's hosted MCP infrastructure.

### MCP endpoint

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

This exposes the Industrial Platform research Actor as an MCP-accessible tool for compatible clients.

See:

```text
examples/mcp/README.md
```

for the current MCP integration guide.

---

## Machine contract

The current research service accepts one required field and two optional fields.

### Required

#### `research_question`

The question or research task to investigate.

Example:

```json
{
  "research_question": "Compare the current pricing and major features of Notion, ClickUp, and Asana for a five-person small business."
}
```

### Optional

#### `context`

Background that helps define the user's situation, constraints, intended use, or decision.

#### `requirements`

Instructions controlling scope, comparison criteria, output format, sources, calculations, citations, or other deliverables.

### Complete example

```json
{
  "research_question": "Compare HubSpot CRM, Pipedrive, and Zoho CRM for a small business.",
  "context": "A five-person company needs predictable pricing, automation, integrations, and straightforward administration.",
  "requirements": "Use current authoritative sources. Include a comparison table, distinguish monthly and annual pricing, cite sources, identify important limitations, and state unresolved facts."
}
```

---

## Output contract

A completed research result contains:

```text
research_question
research_date
brief
status
qa
research
usage
```

A customer-ready result has:

```text
status = ready
```

### `brief`

The completed source-backed research deliverable.

### `qa`

Automated quality-review metadata.

Typical contents include:

```text
score
verdict
issues
summary
revision status
```

### `research`

Research metadata such as:

```text
evidence count
unresolved questions
```

### `usage`

Model-request and token-usage metadata.

---

## Research workflow

The current service follows a multi-stage pipeline.

```text
research question
      ↓
current web research
      ↓
structured evidence packet
      ↓
uncertainty handling
      ↓
research writing
      ↓
automated QA
      ↓
revision when required
      ↓
customer-ready result
```

### Evidence research

The research stage searches current web sources and attempts to prioritize authoritative and primary evidence where available.

### Uncertainty handling

Missing, conflicting, inaccessible, or insufficiently verified information should remain explicitly unresolved rather than being silently invented.

### Research writing

The customer-facing brief is produced from the collected evidence packet and supplied user context.

### Automated QA

Completed work is reviewed for:

- requirements coverage
- factual and analytical correctness
- evidence discipline
- formatting and instruction compliance
- clarity and usability

### Delivery gate

The current research Actor uses a quality threshold before a result is treated as customer-ready.

```text
QA score >= 85
AND
verdict = PASS
```

---

## Good delegation targets

A calling agent should consider delegating to Industrial Platform when the task requires substantially more than a trivial lookup.

Examples:

```text
Need current competitor pricing
        ↓
delegate research
```

```text
Need evidence from several sources
        ↓
delegate research
```

```text
Need a vendor comparison with citations
        ↓
delegate research
```

```text
Need unresolved facts identified explicitly
        ↓
delegate research
```

A simple lookup may be cheaper and faster for the calling agent to perform directly.

---

## Tool-selection heuristic

A parent agent can think of delegation approximately as:

```text
internal search cost
+ search latency
+ synthesis cost
+ verification cost
+ expected error risk

>

cost of delegating the task
```

When the delegated service is cheaper or operationally simpler, the parent agent can call Industrial Platform and continue its workflow with the returned result.

---

## MCP integration

MCP is currently the primary open developer-integration path in this repository.

### Hosted endpoint

```text
https://mcp.apify.com?tools=industrial_platform/research-brief-agent
```

### Actor

```text
industrial_platform/research-brief-agent
```

### Intended MCP flow

```text
AI application
      ↓
MCP client
      ↓
Industrial Platform research tool
      ↓
Apify execution
      ↓
source-backed research result
      ↓
calling application continues
```

Detailed setup:

```text
examples/mcp/README.md
```

---

## REST and API integration

The research Actor can also be invoked programmatically through Apify's Actor API.

Planned examples in this repository include:

```text
examples/curl/
examples/python/
examples/javascript/
```

These examples will demonstrate:

- authenticated execution
- input submission
- result retrieval
- status handling
- error handling
- machine-readable output consumption

Do not commit API tokens, wallet credentials, secrets, or private keys to this repository.

---

## Authentication

Paid Actor execution requires an authenticated execution path.

Depending on the integration, authentication may be handled through:

- Apify account authentication
- supported API-token flows
- supported MCP authentication
- supported agentic-payment infrastructure

Credentials should be stored in environment variables, secret managers, or the calling platform's secure credential store.

Never hardcode secrets into:

```text
README files
example scripts
source files
configuration committed to Git
```

---

## Payments and machine transactions

Industrial Platform is being designed for both conventional developer usage and machine-to-machine transactions.

The current research product uses pay-per-result execution through Apify.

The completed research billing event is:

```text
research-brief-completed
```

A result that does not pass the delivery threshold should not be treated as a completed research result for that event.

Calling systems should inspect the live Actor metadata for current pricing and execution eligibility before invoking paid services.

Agentic-payment availability depends on the underlying platform, supported payment infrastructure, and current service eligibility.

---

## Developer integration strategy

Industrial Platform is being designed so developers can integrate once and create many downstream service calls.

Target integration surfaces include:

```text
Apify Store
Apify API
Apify MCP
MCP clients
agent frameworks
workflow engines
JavaScript
Python
REST
agentic-payment systems
A2A-compatible discovery
machine-readable manifests
developer registries
```

The objective is to make Industrial Platform services available wherever agent developers choose tools.

---

## Repository structure

Current and planned structure:

```text
industrial-platform-agent-tools/
│
├── README.md
├── LICENSE
├── .gitignore
│
├── examples/
│   ├── mcp/
│   │   └── README.md
│   ├── curl/
│   ├── python/
│   └── javascript/
│
├── packages/
│   └── research-mcp/
│
├── manifests/
│   ├── server.json
│   └── agent-card.json
│
└── docs/
    ├── quickstart.md
    ├── machine-contract.md
    ├── pricing.md
    ├── mcp.md
    └── agentic-payments.md
```

Not every planned path is implemented yet.

The repository will expand as integrations are completed and validated.

---

## Planned distribution layers

### 1. Apify

Current execution and monetization infrastructure.

### 2. MCP

Direct tool exposure to compatible AI systems and developer applications.

### 3. JavaScript

Simple integration examples and package support for JavaScript and TypeScript environments.

### 4. Python

Simple integration examples for Python-based AI and automation systems.

### 5. Official and downstream registries

Machine-readable metadata intended to make Industrial Platform services discoverable through developer and agent-tool registries.

### 6. Agent-to-agent discovery

Planned machine-readable agent metadata for systems that delegate tasks between remote agents or services.

---

## Planned service tiers

The current production service is the deeper research workflow.

Future services may include a lower-latency machine-oriented research tier designed for high-frequency agent workloads.

Potential distinction:

```text
FAST RESEARCH
- narrower evidence search
- shorter output
- fewer research passes
- lower latency
- lower transaction price
- high-frequency machine usage
```

```text
DEEP RESEARCH
- broader evidence gathering
- more extensive synthesis
- richer comparison output
- automated QA
- revision when needed
- complex research tasks
```

Any future tier will be benchmarked for:

- latency
- evidence quality
- QA pass rate
- model cost
- platform cost
- failure rate
- gross margin
- developer usefulness

before being treated as a production offering.

---

## Scale objective

The intended architecture is designed for repeatable machine demand rather than one-off manual usage.

```text
one developer integration
        ↓
many downstream agents
        ↓
repeated specialized requests
        ↓
Industrial Platform services
        ↓
paid machine transactions
```

The scaling problem is therefore primarily a distribution and integration problem.

Industrial Platform aims to reduce developer friction until adding a specialized external capability is easier than recreating that capability inside every agent.

---

## Example developer use cases

### Agent framework

An agent framework can expose Industrial Platform research as an optional external research capability.

```text
user task
   ↓
framework planner
   ↓
research required?
   ↓
Industrial Platform
   ↓
cited result
   ↓
framework continues
```

### Procurement workflow

```text
vendor shortlist
   ↓
research competing vendors
   ↓
compare current pricing and features
   ↓
return cited evidence
   ↓
procurement logic
```

### Market-intelligence workflow

```text
company / market question
   ↓
current web research
   ↓
source reconciliation
   ↓
structured brief
   ↓
analysis pipeline
```

### Autonomous application

```text
agent detects evidence gap
   ↓
calls Industrial Platform
   ↓
receives verified research result
   ↓
continues original task
```

---

## Reliability principles

Industrial Platform integrations should prefer explicit uncertainty over unsupported certainty.

Services should aim to:

- prefer authoritative sources where available
- preserve source URLs
- distinguish facts from analysis
- identify unresolved evidence gaps
- avoid fabricating missing information
- preserve meaningful caveats
- expose useful execution metadata
- fail visibly rather than silently when appropriate

Automated QA reduces error risk but does not guarantee factual perfection.

---

## Security

Do not commit:

- API keys
- access tokens
- private keys
- wallet seed phrases
- passwords
- account credentials
- customer secrets

Use environment variables or secure secret-management systems.

If a credential is accidentally committed, revoke or rotate it immediately.

---

## Contributing

This repository is currently maintained by Industrial Platform.

Issues and pull requests may be used for:

- integration fixes
- compatibility improvements
- documentation corrections
- example implementations
- developer experience improvements
- protocol support
- framework integrations

Service-specific production infrastructure may remain separately maintained.

---

## License

Integration examples and open-source code in this repository are provided under the MIT License unless otherwise noted.

See:

```text
LICENSE
```

---

## Industrial Platform

Industrial Platform builds agent-native research, analysis, and data-processing services for:

- autonomous AI agents
- developers
- agent frameworks
- MCP clients
- multi-agent systems
- workflow products
- machine-to-machine applications

The goal is to make specialized external capabilities easy for other systems to discover, evaluate, invoke, pay for, and consume programmatically.

**Organization**

```text
industrial-platform-ai
```

**Current research Actor**

```text
industrial_platform/research-brief-agent
```

**Developer toolkit**

```text
industrial-platform-agent-tools
```
