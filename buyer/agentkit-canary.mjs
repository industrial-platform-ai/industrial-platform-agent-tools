import { ViemWalletProvider, x402ActionProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const GATEWAY = "https://x402-gateway-production-1f21.up.railway.app";
const key = process.env.EVM_PRIVATE_KEY;
if (!key) throw new Error("EVM_PRIVATE_KEY missing");

const account = privateKeyToAccount(key);
const walletProvider = new ViemWalletProvider(
  createWalletClient({ account, chain: base, transport: http() })
);

const provider = x402ActionProvider({
  registeredServices: [GATEWAY],
  allowDynamicServiceRegistration: false,
  maxPaymentUsdc: 0.000001,
});

const args = {
  url: GATEWAY + "/hash",
  method: "POST",
  headers: { "content-type": "application/json" },
  queryParams: null,
  body: { text: "industrial-platform-agentkit-controlled-canary", algo: "sha256" },
};

const first = JSON.parse(await provider.makeHttpRequest(walletProvider, args));
console.log("AGENTKIT_INITIAL", JSON.stringify(first));

if (first.status !== "error_402_payment_required") {
  throw new Error("Expected 402 before payment");
}

const options = first.acceptablePaymentOptions || [];
if (!options.length) throw new Error("No acceptable payment option");

const option = options[0];
const amount = BigInt(option.amount ?? option.maxAmountRequired ?? "0");
if (amount > 1n) {
  throw new Error("Refusing payment above 1 atomic USDC: " + amount);
}

console.log("AGENTKIT_AUTHORIZED", JSON.stringify({
  payer: account.address,
  network: option.network,
  asset: option.asset,
  amountAtomic: amount.toString(),
  maxPaymentUsdc: 0.000001,
}));

const paid = JSON.parse(await provider.retryWithX402(walletProvider, {
  ...args,
  selectedPaymentOption: option,
}));

console.log("AGENTKIT_PAID_RETRY", JSON.stringify(paid));

if (paid.status !== "success") {
  throw new Error("AgentKit paid retry failed");
}

console.log("AGENTKIT_CANARY_SETTLED", JSON.stringify({
  payer: account.address,
  route: "/hash",
  amountAtomic: amount.toString(),
  controlled: true,
}));
