# Industrial Platform AgentKit Action Provider

Native Coinbase AgentKit actions backed by Industrial Platform x402 endpoints.

## Why this exists

After an operator adds this provider once, Industrial Platform is a first-class AgentKit Action Provider rather than a seller selected from a marketplace at execution time. AgentKit still owns the wallet, x402 client, USDC payment checks and payment proof handling.

## One-command install

Run this from the root of an existing TypeScript AgentKit project:

```bash
curl -fsSL https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/agentkit-industrial-platform/install.mjs | node
```

The installer is deliberately conservative. It:

1. verifies the project already depends on `@coinbase/agentkit`;
2. vendors this provider into `vendor/industrial-platform-agentkit`;
3. adds it as a local package dependency, avoiding any npm publication dependency;
4. enables `experimentalDecorators` and `emitDecoratorMetadata` when a `tsconfig.json` exists;
5. finds exactly one `AgentKit.from(...)` initialization with an `actionProviders` array;
6. adds `industrialPlatformActionProvider({ maxPaymentUsdc: 0.05, rememberRecurringState: true })`;
7. runs `npm install`.

If the project has zero or multiple plausible AgentKit initialization files, the installer refuses to guess.

Files it edits receive a `.before-industrial-platform` backup on first install. Re-running the installer is idempotent.

The vendored package is also available directly at `integrations/agentkit-industrial-platform`.

## Usage

```ts
import { AgentKit, cdpEvmWalletActionProvider } from "@coinbase/agentkit";
import { industrialPlatformActionProvider } from "@industrial-platform/agentkit";

const agentkit = await AgentKit.from({
  walletProvider,
  actionProviders: [
    cdpEvmWalletActionProvider(),
    industrialPlatformActionProvider({
      maxPaymentUsdc: 0.05,
      rememberRecurringState: true,
    }),
  ],
});
```

AgentKit action names are prefixed by the provider class according to AgentKit's normal action naming convention.

## Native Industrial Platform actions

- `url_to_markdown`
- `monitor_webpage`
- `extract_web_metadata`
- `wallet_balance`
- `transaction_status`
- `gas_state`
- `erc20_allowance`
- `wallet_activity`
- `monitor_wallet`
- `treasury_snapshot`
- `pretrade_context`
- `watch_transaction`

## Payment behavior

The provider delegates payment signing to AgentKit's own published `X402ActionProvider`.

For AgentKit 0.10.4 it uses the safer two-step path internally:

1. make the unpaid request;
2. inspect the 402 requirements;
3. require Base mainnet, Base USDC and Industrial Platform's canonical seller address;
4. reject a quoted amount above the route's expected price or `maxPaymentUsdc`;
5. ask AgentKit to perform the signed x402 retry.

The default maximum is $0.05 USDC per request and can be lowered by the operator.

The provider never receives or manages the buyer's private key.

## Recurrence

During one AgentKit process, the provider remembers:

- webpage `current_hash`;
- wallet-monitor `next_cursor` and `current_state_hash`;
- treasury `activity_cursor` and `current_state_hash`;
- transaction-watch `current_state_hash`.

Explicit caller-supplied state always overrides remembered state.
