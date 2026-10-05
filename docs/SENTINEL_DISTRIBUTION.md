# Industrial Sentinel distribution matrix

Status date: 2026-10-05

## Live, machine-consumable surfaces

### skills.sh / Agent Skills

Public source:
- `skills/industrial-sentinel/SKILL.md`

Tested installer:
```bash
npx skills add https://github.com/industrial-platform-ai/industrial-platform-agent-tools --skill industrial-sentinel -y
```

The repository is publicly indexed by skills.sh. Installation does not grant wallet or package-management authority.

### Portable Agent Plugins / Git marketplaces

Portable plugin:
- `plugins/industrial-sentinel/plugin.json`
- `plugins/industrial-sentinel/skills/industrial-sentinel/SKILL.md`

Marketplace manifests:
- `.agents/plugins/marketplace.json`
- `.github/plugin/marketplace.json`
- `.cursor-plugin/marketplace.json`

### AIMarket / ModelMarket federation

Live peer origin:
- `https://x402-gateway-production-1f21.up.railway.app`

Discovery:
- `/.well-known/ai-market.json`
- `/ai-market/v2/manifest`
- `/ai-market/v2/search`
- `POST /ai-market/v2/invoke`

Capabilities:
- `industrial.sentinel.install@v1`
- `industrial.sentinel.wallet-monitor-bootstrap@v1`
- `industrial.sentinel.treasury-monitor-bootstrap@v1`
- `industrial.sentinel.transaction-watch-bootstrap@v1`

The peer uses a persistent Ed25519 identity and signed manifests/receipts. The bootstrap is free and does not authorize a wallet. It returns immutable source/container provenance. Paid recurrence occurs only after an external operator separately authorizes and configures the installed Sentinel runtime.

Federation admission state on 2026-10-05:
- `hunt.modelmarket.dev`: announcement accepted; sandbox assay verdict **pass**; pending operator approval because that hub has no automatic judge token.
- `hub.modelmarket.dev`: announcement accepted; initial assay verdict **review** because the original bootstrap returned unpinned install commands and wallet configuration. The production bootstrap has since been hardened to immutable references and separated wallet authorization; the hub requires its operator to rerun/approve the pending peer.
- `modelmarket.dev`: direct announcement endpoint returns HTTP 500. This is external to Industrial Platform; the live Sentinel peer, signed discovery, manifest, and invoke endpoints are healthy.

## Built but externally gated

### GitHub Container Registry

Published image:
`ghcr.io/industrial-platform-ai/industrial-sentinel-runtime@sha256:555d20e6ac94b261a1858db5c2f880646408224975217265f77fda44be25b56b`

The image exists and was published successfully. Anonymous-pull CI currently fails because the existing package still needs its **package-level** visibility changed to Public. Organization-level "Package creation: Public" does not retroactively make an existing package public.

### x402.space / Skill Hub

The Sentinel `SKILL.md` is ready for the Skill Hub pipeline. The upstream publication path requires:
1. upload the skill;
2. pass the security scanner;
3. connect a Solana wallet;
4. sign/pay the publish fee;
5. let the relay anchor the package hash on Arweave/Solana.

No wallet secret belongs in this repository. Publication cannot be completed by CI without an operator-authorized Solana signer.

### Singularity Layer / x402Layer

The public MCP supports marketplace discovery without auth, but owner writes require a dashboard PAT with appropriate scopes. Endpoint creation additionally uses a payment-backed flow. To list Sentinel there, an operator must provide an owner-authorized Singularity PAT/wallet session and complete the endpoint-creation payment. No credentials are stored in this repository.

## Supply-chain policy

- Prefer immutable OCI digests for container deployment.
- The AIMarket bootstrap exposes immutable Git/container provenance and no unpinned install command.
- Never bypass first-install trust, runtime permission controls, wallet ownership, or spend limits.
- Never commit wallet private keys, PATs, package tokens, or signing secrets.
