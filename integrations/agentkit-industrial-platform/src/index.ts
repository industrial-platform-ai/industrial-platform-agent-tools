import "reflect-metadata";
import {
  ActionProvider,
  CreateAction,
  Network,
  WalletProvider,
  X402ActionProvider,
  x402ActionProvider,
} from "@coinbase/agentkit";
import { z } from "zod";

const DEFAULT_BASE_URL = "https://x402-gateway-production-1f21.up.railway.app";

const evmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const network = z.enum(["base", "ethereum"]).optional();
const stateHash = z.string().regex(/^[a-fA-F0-9]{64}$/).optional();

const UrlMarkdownSchema = z.object({
  url: z.string().url(),
  max_chars: z.number().int().min(1000).max(500000).optional(),
  timeout_seconds: z.number().int().min(5).max(60).optional(),
});

const WebMonitorSchema = z.object({
  url: z.string().url(),
  previous_hash: z.string().optional(),
  previous_text: z.string().optional(),
  include_current_text: z.boolean().optional(),
  timeout_seconds: z.number().int().min(5).max(60).optional(),
});

const MetadataSchema = z.object({
  url: z.string().url(),
  timeout_seconds: z.number().int().min(5).max(60).optional(),
});

const WalletBalanceSchema = z.object({
  address: evmAddress,
  chain: z.string().optional(),
});

const TransactionStatusSchema = z.object({
  tx_hash: txHash,
  network,
});

const GasStateSchema = z.object({ network });

const AllowanceSchema = z.object({
  owner: evmAddress,
  spender: evmAddress,
  contract: evmAddress,
  network,
});

const WalletActivitySchema = z.object({
  address: evmAddress,
  contract: evmAddress.optional(),
  network,
  cursor: z.number().int().nonnegative().optional(),
  lookback_blocks: z.number().int().min(1).max(5000).optional(),
});

const WalletMonitorSchema = z.object({
  address: evmAddress,
  network,
  tokens: z.array(evmAddress).max(20).optional(),
  activity_contract: evmAddress.optional(),
  cursor: z.number().int().nonnegative().optional(),
  lookback_blocks: z.number().int().min(1).max(5000).optional(),
  previous_state_hash: stateHash,
});

const TreasurySnapshotSchema = z.object({
  address: evmAddress,
  network,
  tokens: z.array(evmAddress).max(20).optional(),
  activity_contract: evmAddress.optional(),
  activity_cursor: z.number().int().nonnegative().optional(),
  lookback_blocks: z.number().int().min(1).max(5000).optional(),
  previous_state_hash: stateHash,
});

const PretradeSchema = z.object({
  address: evmAddress,
  spender: evmAddress,
  token_contract: evmAddress,
  network,
  product_id: z.string().regex(/^[A-Za-z0-9]{2,15}-[A-Za-z0-9]{2,15}$/),
  balance_tokens: z.array(evmAddress).max(20).optional(),
});

const TransactionWatchSchema = z.object({
  tx_hash: txHash,
  network,
  previous_state_hash: stateHash,
});

export interface IndustrialPlatformActionProviderConfig {
  baseUrl?: string;
  maxPaymentUsdc?: number;
  rememberRecurringState?: boolean;
}

type JsonObject = Record<string, unknown>;

export class IndustrialPlatformActionProvider extends ActionProvider<WalletProvider> {
  private readonly baseUrl: string;
  private readonly rememberRecurringState: boolean;
  private readonly x402: X402ActionProvider;
  private readonly webpageHashes = new Map<string, string>();
  private readonly walletMonitorState = new Map<string, { cursor?: number; previous_state_hash?: string }>();
  private readonly treasuryState = new Map<string, { activity_cursor?: number; previous_state_hash?: string }>();
  private readonly transactionState = new Map<string, string>();

  constructor(config: IndustrialPlatformActionProviderConfig = {}) {
    super("industrial_platform", []);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.rememberRecurringState = config.rememberRecurringState ?? true;
    this.x402 = x402ActionProvider({
      registeredServices: [this.baseUrl],
      allowDynamicServiceRegistration: false,
      maxPaymentUsdc: config.maxPaymentUsdc ?? 0.05,
    });
  }

  supportsNetwork(networkInfo: Network): boolean {
    return networkInfo.networkId === "base-mainnet";
  }

  private walletKey(address: string, selectedNetwork?: string): string {
    return `${selectedNetwork ?? "base"}:${address.toLowerCase()}`;
  }

  private txKey(hash: string, selectedNetwork?: string): string {
    return `${selectedNetwork ?? "base"}:${hash.toLowerCase()}`;
  }

  private async paidRequest(
    walletProvider: WalletProvider,
    path: string,
    method: "GET" | "POST",
    args: JsonObject,
  ): Promise<JsonObject> {
    const queryParams: Record<string, string> = {};
    let body: JsonObject | null = null;

    if (method === "GET") {
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined && value !== null) queryParams[key] = String(value);
      }
    } else {
      body = Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== undefined),
      );
    }

    const raw = await this.x402.makeHttpRequestWithX402(walletProvider, {
      url: `${this.baseUrl}${path}`,
      method,
      headers: { Accept: "application/json" },
      queryParams: method === "GET" ? queryParams : null,
      body,
    });

    const parsed = JSON.parse(raw) as JsonObject;
    if (parsed.success === false || parsed.error === true) {
      throw new Error(raw);
    }
    return parsed;
  }

  private data(result: JsonObject): JsonObject {
    const value = result.data;
    return value && typeof value === "object" ? value as JsonObject : result;
  }

  @CreateAction({
    name: "url_to_markdown",
    description: "Convert a public URL to clean Markdown for RAG and agent context. Paid directly to Industrial Platform over x402.",
    schema: UrlMarkdownSchema,
  })
  async urlToMarkdown(walletProvider: WalletProvider, args: z.infer<typeof UrlMarkdownSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/web/markdown", "POST", args));
  }

  @CreateAction({
    name: "monitor_webpage",
    description: "Detect whether a webpage changed. Reuses the prior current_hash for the same URL during this process unless previous_hash is supplied.",
    schema: WebMonitorSchema,
  })
  async monitorWebpage(walletProvider: WalletProvider, args: z.infer<typeof WebMonitorSchema>) {
    const body = { ...args };
    if (this.rememberRecurringState && !body.previous_hash) {
      body.previous_hash = this.webpageHashes.get(body.url);
    }
    const result = await this.paidRequest(walletProvider, "/change", "POST", body);
    const data = this.data(result);
    if (this.rememberRecurringState && typeof data.current_hash === "string") {
      this.webpageHashes.set(body.url, data.current_hash);
    }
    return JSON.stringify(result);
  }

  @CreateAction({
    name: "extract_web_metadata",
    description: "Extract title, canonical URL, OpenGraph, Twitter cards and JSON-LD for one public URL.",
    schema: MetadataSchema,
  })
  async extractWebMetadata(walletProvider: WalletProvider, args: z.infer<typeof MetadataSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/metadata-single", "POST", args));
  }

  @CreateAction({
    name: "wallet_balance",
    description: "Return native ETH and USDC balances for one EVM wallet.",
    schema: WalletBalanceSchema,
  })
  async walletBalance(walletProvider: WalletProvider, args: z.infer<typeof WalletBalanceSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/wallet-balance/cdp", "GET", args));
  }

  @CreateAction({
    name: "transaction_status",
    description: "Check whether an EVM transaction is pending, confirmed or reverted, with confirmation and gas metadata.",
    schema: TransactionStatusSchema,
  })
  async transactionStatus(walletProvider: WalletProvider, args: z.infer<typeof TransactionStatusSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/transaction-status", "GET", args));
  }

  @CreateAction({
    name: "gas_state",
    description: "Get current EVM gas price, latest block base fee and gas utilization.",
    schema: GasStateSchema,
  })
  async gasState(walletProvider: WalletProvider, args: z.infer<typeof GasStateSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/gas-state", "GET", args));
  }

  @CreateAction({
    name: "erc20_allowance",
    description: "Check ERC-20 allowance from an owner wallet to a spender contract before autonomous execution.",
    schema: AllowanceSchema,
  })
  async erc20Allowance(walletProvider: WalletProvider, args: z.infer<typeof AllowanceSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/erc20-allowance", "GET", args));
  }

  @CreateAction({
    name: "wallet_activity",
    description: "Return recent USDC/ERC-20 transfers plus next_cursor for recurring stablecoin monitoring.",
    schema: WalletActivitySchema,
  })
  async walletActivity(walletProvider: WalletProvider, args: z.infer<typeof WalletActivitySchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/wallet-activity", "GET", args));
  }

  @CreateAction({
    name: "monitor_wallet",
    description: "Recurring wallet monitor for balance changes and new USDC/ERC-20 transfers. Reuses cursor/state for the same wallet during this process.",
    schema: WalletMonitorSchema,
  })
  async monitorWallet(walletProvider: WalletProvider, args: z.infer<typeof WalletMonitorSchema>) {
    const body = { ...args };
    const key = this.walletKey(body.address, body.network);
    if (this.rememberRecurringState) {
      const remembered = this.walletMonitorState.get(key);
      if (remembered) {
        if (body.cursor === undefined) body.cursor = remembered.cursor;
        if (!body.previous_state_hash) body.previous_state_hash = remembered.previous_state_hash;
      }
    }
    const result = await this.paidRequest(walletProvider, "/agent/wallet-monitor", "POST", body);
    const data = this.data(result);
    const next = data.next_check as JsonObject | undefined;
    if (this.rememberRecurringState && next) {
      this.walletMonitorState.set(key, {
        cursor: typeof next.cursor === "number" ? next.cursor : undefined,
        previous_state_hash: typeof next.previous_state_hash === "string" ? next.previous_state_hash : undefined,
      });
    }
    return JSON.stringify(result);
  }

  @CreateAction({
    name: "treasury_snapshot",
    description: "One-call treasury snapshot: balances, gas/base fee and recent stablecoin activity. Reuses cursor/state for repeated polling.",
    schema: TreasurySnapshotSchema,
  })
  async treasurySnapshot(walletProvider: WalletProvider, args: z.infer<typeof TreasurySnapshotSchema>) {
    const body = { ...args };
    const key = this.walletKey(body.address, body.network);
    if (this.rememberRecurringState) {
      const remembered = this.treasuryState.get(key);
      if (remembered) {
        if (body.activity_cursor === undefined) body.activity_cursor = remembered.activity_cursor;
        if (!body.previous_state_hash) body.previous_state_hash = remembered.previous_state_hash;
      }
    }
    const result = await this.paidRequest(walletProvider, "/agent/treasury-snapshot", "POST", body);
    const data = this.data(result);
    const next = data.next_check as JsonObject | undefined;
    if (this.rememberRecurringState && next) {
      this.treasuryState.set(key, {
        activity_cursor: typeof next.activity_cursor === "number" ? next.activity_cursor : undefined,
        previous_state_hash: typeof next.previous_state_hash === "string" ? next.previous_state_hash : undefined,
      });
    }
    return JSON.stringify(result);
  }

  @CreateAction({
    name: "pretrade_context",
    description: "Data-only pre-trade context: wallet balances, ERC-20 allowance, gas, realtime price, 24h market stats and bid/ask spread. Never submits a trade.",
    schema: PretradeSchema,
  })
  async pretradeContext(walletProvider: WalletProvider, args: z.infer<typeof PretradeSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/agent/pretrade", "POST", args));
  }

  @CreateAction({
    name: "watch_transaction",
    description: "Poll an EVM transaction until confirmed or reverted. Reuses the prior state hash for the same transaction during this process.",
    schema: TransactionWatchSchema,
  })
  async watchTransaction(walletProvider: WalletProvider, args: z.infer<typeof TransactionWatchSchema>) {
    const body = { ...args };
    const key = this.txKey(body.tx_hash, body.network);
    if (this.rememberRecurringState && !body.previous_state_hash) {
      body.previous_state_hash = this.transactionState.get(key);
    }
    const result = await this.paidRequest(walletProvider, "/agent/transaction-watch", "POST", body);
    const data = this.data(result);
    const monitoring = data.monitoring as JsonObject | undefined;
    const terminal = data.terminal === true;
    if (this.rememberRecurringState) {
      if (terminal) {
        this.transactionState.delete(key);
      } else if (monitoring && typeof monitoring.current_state_hash === "string") {
        this.transactionState.set(key, monitoring.current_state_hash);
      }
    }
    return JSON.stringify(result);
  }
}

export const industrialPlatformActionProvider = (
  config?: IndustrialPlatformActionProviderConfig,
) => new IndustrialPlatformActionProvider(config);
