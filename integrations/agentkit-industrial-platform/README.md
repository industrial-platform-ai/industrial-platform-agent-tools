# Industrial Platform AgentKit Action Provider

Native Coinbase AgentKit actions backed by Industrial Platform x402 endpoints.

## Why this exists

After an operator adds this provider once, Industrial Platform is a first-class AgentKit Action Provider rather than a seller selected from a marketplace at execution time. AgentKit still owns the wallet, x402 client, USDC payment checks and payment proof handling.

## Install

Until this package is published to npm, use the source from this repository in your AgentKit project. The package is located at `integrations/agentkit-industrial-platform`.

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

The provider delegates paid requests to AgentKit's own `X402ActionProvider`.

Industrial Platform is pre-registered as the only service URL used by these native actions. Dynamic service registration is disabled inside this provider. The default maximum payment is $0.05 USDC per request and can be lowered by the operator.

The provider does not receive or manage the buyer's private key.

## Recurrence

During one AgentKit process, the provider remembers:

- webpage `current_hash`;
- wallet-monitor `next_cursor` and `current_state_hash`;
- treasury `activity_cursor` and `current_state_hash`;
- transaction-watch `current_state_hash`.

Explicit caller-supplied state always overrides remembered state.
