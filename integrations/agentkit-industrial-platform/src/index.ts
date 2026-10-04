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
const INDUSTRIAL_PLATFORM_PAY_TO = "0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_NETWORKS = new Set(["eip155:8453", "base-mainnet"]);

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
type AgentKitPaymentOption = {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired?: string;
  amount?: string;
  price?: string;
  payTo?: string;
};

export class IndustrialPlatformActionProvider extends ActionProvider<WalletProvider> {
  private readonly baseUrl: string;
  private readonly rememberRecurringState: boolean;
  private readonly maxPaymentUsdc: number;
  private readonly x402: X402ActionProvider;
  private readonly webpageHashes = new Map<string, string>();
  private readonly walletMonitorState = new Map<string, { cursor?: number; previous_state_hash?: string }>();
  private readonly treasuryState = new Map<string, { activity_cursor?: number; previous_state_hash?: string }>();
  private readonly transactionState = new Map<string, string>();

  constructor(config: IndustrialPlatformActionProviderConfig = {}) {
    super("industrial_platform", []);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.rememberRecurringState = config.rememberRecurringState ?? true;
    this.maxPaymentUsdc = config.maxPaymentUsdc ?? 0.05;
    this.x402 = x402ActionProvider();
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

  private paymentAmountUsdc(option: AgentKitPaymentOption): number | null {
    const raw = option.amount ?? option.maxAmountRequired ?? option.price;
    if (typeof raw === "number") return raw;
    if (typeof raw !== "string") return null;
    if (/^[0-9]+$/.test(raw)) return Number(raw) / 1_000_000;
    const numeric = Number(raw.replace(/^\$/, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  private selectPaymentOption(options: unknown[], expectedPriceUsdc: number): AgentKitPaymentOption {
    const matches = options.filter((value): value is AgentKitPaymentOption => {
      if (!value || typeof value !== "object") return false;
      const option = value as Partial<AgentKitPaymentOption>;
      if (typeof option.scheme !== "string" || typeof option.network !== "string" || typeof option.asset !== "string") return false;
      const networkValue = String(option.network ?? "");
      const asset = String(option.asset ?? "").toLowerCase();
      const payTo = String(option.payTo ?? "").toLowerCase();
      const amount = this.paymentAmountUsdc(option);
      return BASE_NETWORKS.has(networkValue)
        && asset === BASE_USDC.toLowerCase()
        && payTo === INDUSTRIAL_PLATFORM_PAY_TO.toLowerCase()
        && amount !== null
        && amount <= expectedPriceUsdc + 1e-9
        && amount <= this.maxPaymentUsdc + 1e-9;
    });

    if (matches.length !== 1) {
      throw new Error(
        `Industrial Platform payment preflight expected exactly one approved Base USDC option; found ${matches.length}.`,
      );
    }
    return matches[0];
  }

  private async paidRequest(
    walletProvider: WalletProvider,
    path: string,
    method: "GET" | "POST",
    args: JsonObject,
    expectedPriceUsdc: number,
  ): Promise<JsonObject> {
    if (expectedPriceUsdc > this.maxPaymentUsdc + 1e-9) {
      throw new Error(
        `Industrial Platform route price ${expectedPriceUsdc} exceeds configured maxPaymentUsdc ${this.maxPaymentUsdc}.`,
      );
    }

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

    const request = {
      url: `${this.baseUrl}${path}`,
      method,
      headers: { Accept: "application/json" },
      queryParams: method === "GET" ? queryParams : null,
      body,
    };

    const preflightRaw = await this.x402.makeHttpRequest(walletProvider, request);
    const preflight = JSON.parse(preflightRaw) as JsonObject;

    if (preflight.success === true && preflight.status !== 402) {
      return preflight;
    }

    if (preflight.status !== "error_402_payment_required") {
      throw new Error(preflightRaw);
    }

    const options = Array.isArray(preflight.acceptablePaymentOptions)
      ? preflight.acceptablePaymentOptions
      : [];
    const selectedPaymentOption = this.selectPaymentOption(options, expectedPriceUsdc);

    const paidRaw = await this.x402.retryWithX402(walletProvider, {
      ...request,
      selectedPaymentOption,
    });
    const paid = JSON.parse(paidRaw) as JsonObject;
    if (paid.status !== "success" || paid.error === true) {
      throw new Error(paidRaw);
    }
    return paid;
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
    return JSON.stringify(await this.paidRequest(walletProvider, "/web/markdown", "POST", args, 0.001));
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
    const result = await this.paidRequest(walletProvider, "/change", "POST", body, 0.001);
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
    return JSON.stringify(await this.paidRequest(walletProvider, "/metadata-single", "POST", args, 0.001));
  }

  @CreateAction({
    name: "wallet_balance",
    description: "Return native ETH and USDC balances for one EVM wallet.",
    schema: WalletBalanceSchema,
  })
  async walletBalance(walletProvider: WalletProvider, args: z.infer<typeof WalletBalanceSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/wallet-balance/cdp", "GET", args, 0.001));
  }

  @CreateAction({
    name: "transaction_status",
    description: "Check whether an EVM transaction is pending, confirmed or reverted, with confirmation and gas metadata.",
    schema: TransactionStatusSchema,
  })
  async transactionStatus(walletProvider: WalletProvider, args: z.infer<typeof TransactionStatusSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/transaction-status", "GET", args, 0.001));
  }

  @CreateAction({
    name: "gas_state",
    description: "Get current EVM gas price, latest block base fee and gas utilization.",
    schema: GasStateSchema,
  })
  async gasState(walletProvider: WalletProvider, args: z.infer<typeof GasStateSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/gas-state", "GET", args, 0.001));
  }

  @CreateAction({
    name: "erc20_allowance",
    description: "Check ERC-20 allowance from an owner wallet to a spender contract before autonomous execution.",
    schema: AllowanceSchema,
  })
  async erc20Allowance(walletProvider: WalletProvider, args: z.infer<typeof AllowanceSchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/erc20-allowance", "GET", args, 0.001));
  }

  @CreateAction({
    name: "wallet_activity",
    description: "Return recent USDC/ERC-20 transfers plus next_cursor for recurring stablecoin monitoring.",
    schema: WalletActivitySchema,
  })
  async walletActivity(walletProvider: WalletProvider, args: z.infer<typeof WalletActivitySchema>) {
    return JSON.stringify(await this.paidRequest(walletProvider, "/wallet-activity", "GET", args, 0.001));
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
    const result = await this.paidRequest(walletProvider, "/agent/wallet-monitor", "POST", body, 0.005);
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
    const result = await this.paidRequest(walletProvider, "/agent/treasury-snapshot", "POST", body, 0.01);
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
    return JSON.stringify(await this.paidRequest(walletProvider, "/agent/pretrade", "POST", args, 0.01));
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
    const result = await this.paidRequest(walletProvider, "/agent/transaction-watch", "POST", body, 0.003);
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
