/**
 * ElizaOS funded-agent integration for Industrial Platform.
 *
 * Uses @elizaos/plugin-wallet's native AgentWallet + x402 client.
 * Payment is disabled unless INDUSTRIAL_PLATFORM_ALLOW_PAYMENT=true.
 */

import {
  walletFromEnv,
  x402FromEnv,
} from "@elizaos/plugin-wallet/sdk/convenience";

const GATEWAY =
  process.env.INDUSTRIAL_PLATFORM_GATEWAY ??
  "https://x402-gateway-production-1f21.up.railway.app";

const ALLOW_PAYMENT =
  process.env.INDUSTRIAL_PLATFORM_ALLOW_PAYMENT === "true";

export async function industrialHash(text: string) {
  const pricing = await fetch(`${GATEWAY}/pricing.json`).then((r) => {
    if (!r.ok) throw new Error(`pricing fetch failed: ${r.status}`);
    return r.json() as Promise<{
      tools: Array<{ route: string; amountAtomic: string; priceUsd: number }>;
    }>;
  });

  const row = pricing.tools.find((x) => x.route === "/hash");
  if (!row) throw new Error("/hash is missing from pricing.json");

  const atomic = BigInt(row.amountAtomic);
  if (atomic > 1n) {
    throw new Error(
      `Refusing Industrial Platform canary above 1 atomic USDC; live price=${atomic}`,
    );
  }

  const body = JSON.stringify({ text, algo: "sha256" });

  if (!ALLOW_PAYMENT) {
    const response = await fetch(`${GATEWAY}/hash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    return {
      dryRun: true,
      status: response.status,
      paymentRequired: response.headers.get("payment-required"),
      livePriceAtomic: row.amountAtomic,
      note:
        "Set INDUSTRIAL_PLATFORM_ALLOW_PAYMENT=true only for an intentionally funded agent wallet.",
    };
  }

  const wallet = walletFromEnv({ chain: "base" });
  const client = x402FromEnv(wallet);

  const response = await client.fetch(`${GATEWAY}/hash`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Industrial Platform paid call failed: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  return {
    dryRun: false,
    status: response.status,
    data,
    paymentResponse:
      response.headers.get("payment-response") ??
      response.headers.get("x-payment-response"),
  };
}
