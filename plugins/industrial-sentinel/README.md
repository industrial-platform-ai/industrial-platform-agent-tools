# Industrial Sentinel — Portable Agent Plugin

This portable Agent Plugin contains the Industrial Sentinel Agent Skill. It is intentionally skills-only: wallet custody, signing, recurrence, and x402 payment execution remain in the separately reviewed OpenClaw plugin or pre-integrated GHCR runtime.

## Install surfaces

- ChatGPT/Codex Git marketplace: `industrial-platform-ai/industrial-platform-agent-tools`
- GitHub Copilot / VS Code Git marketplace: same repository
- Cursor Team Marketplace: same repository
- skills.sh-compatible agents: install the repository skill named `industrial-sentinel`
- OpenClaw runtime: `openclaw plugins install industrial-sentinel --marketplace industrial-platform-ai/industrial-platform-agent-tools`
- Pre-integrated runtime: `ghcr.io/industrial-platform-ai/industrial-sentinel-runtime:latest`

The skill never bypasses first-install trust or wallet permissions.
