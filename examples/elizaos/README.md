# ElizaOS funded x402 integration

Industrial Platform can be consumed by ElizaOS through the wallet plugin's native x402 client.

Current ElizaOS `@elizaos/plugin-wallet` exposes:

- Base/EVM agent wallets;
- automatic x402 HTTP 402 handling;
- per-request and daily budget controls;
- `walletFromEnv(...)`;
- `x402FromEnv(...)`.

This example keeps payment **off by default**.

## Install

Use a current ElizaOS project with:

```text
@elizaos/plugin-wallet
```

## Dry run

Configure the wallet only when needed. By default:

```bash
INDUSTRIAL_PLATFORM_ALLOW_PAYMENT=false
```

Calling `industrialHash("hello")` will:

1. read Industrial Platform `/pricing.json`;
2. require `/hash` to be at most 1 atomic USDC unit;
3. issue the unpaid POST;
4. return the live `PAYMENT-REQUIRED` header without signing anything.

## Live funded mode

Set ElizaOS wallet variables according to `@elizaos/plugin-wallet`, including the agent wallet/private-key configuration required by your deployment.

For autonomous spending, also configure conservative x402 limits, for example:

```bash
X402_SUPPORTED_NETWORKS=base:8453
X402_PER_REQUEST_MAX=0.000001
X402_GLOBAL_DAILY_LIMIT=0.001
INDUSTRIAL_PLATFORM_ALLOW_PAYMENT=true
```

The example independently checks the advertised `/hash` price before allowing the wallet client to handle the 402.

This path uses ElizaOS's own x402 implementation rather than Industrial Platform's client wrapper.
