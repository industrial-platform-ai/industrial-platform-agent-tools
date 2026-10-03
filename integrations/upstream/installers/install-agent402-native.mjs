#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), "mcp/index.js");
if (!fs.existsSync(target)) {
  console.error("Expected mcp/index.js in current directory. Run this from the root of MikeyPetrillo/Agent402.");
  process.exit(2);
}
let src = fs.readFileSync(target, "utf8");
if (!src.includes('const BUDGET = num(process.env.AGENT402_BUDGET) ?? Infinity;')) {
  console.error("Agent402 spend-control anchor not found; refusing to patch an unknown version.");
  process.exit(3);
}
if (!src.includes('name: "route_and_execute"')) {
  console.error("Agent402 route_and_execute surface not found; refusing to patch an unknown version.");
  process.exit(4);
}
if (src.includes("INDUSTRIAL_PLATFORM_TOOLS")) {
  console.log("Industrial Platform native tools are already installed.");
  process.exit(0);
}

const constants = `
const INDUSTRIAL_PLATFORM_BASE =
  (process.env.INDUSTRIAL_PLATFORM_URL ||
   "https://x402-gateway-production-1f21.up.railway.app").replace(/\\/$/, "");
const industrialMonitorHashes = new Map();
const INDUSTRIAL_PLATFORM_TOOLS = {
  url_to_markdown: {
    title: "Industrial Platform: URL to Markdown",
    method: "POST",
    path: "/web/markdown",
    price: "$0.001",
    description: "Convert a public webpage URL to clean Markdown for RAG, grounding, research, summarization and LLM context.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) webpage URL." },
        max_chars: { type: "number", description: "Maximum Markdown characters." },
        timeout_seconds: { type: "number", description: "Fetch timeout in seconds." }
      },
      required: ["url"]
    }
  },
  monitor_webpage: {
    title: "Industrial Platform: Monitor webpage",
    method: "POST",
    path: "/change",
    price: "$0.001",
    description: "Detect meaningful webpage changes. Reuses the last successful current_hash for this URL as previous_hash during the same runtime session.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public webpage URL." },
        previous_hash: { type: "string", description: "Optional explicit previous hash." },
        previous_text: { type: "string" },
        include_current_text: { type: "boolean" },
        timeout_seconds: { type: "number" }
      },
      required: ["url"]
    }
  },
  extract_web_metadata: {
    title: "Industrial Platform: Extract webpage metadata",
    method: "POST",
    path: "/metadata-single",
    price: "$0.001",
    description: "Extract title, canonical URL, robots directives, headings, OpenGraph, Twitter cards and JSON-LD for one public URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) webpage URL." },
        timeout_seconds: { type: "number" }
      },
      required: ["url"]
    }
  },
  wallet_balance: {
    title: "Industrial Platform: Wallet balance",
    method: "GET",
    path: "/wallet-balance/cdp",
    price: "$0.001",
    description: "Return native ETH and USDC balances for one wallet on Base or Ethereum.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "20-byte EVM wallet address." },
        chain: { type: "string", description: "CAIP-2 chain id; defaults to eip155:8453." }
      },
      required: ["address"]
    }
  }
};
`;

src = src.replace(
  'const BUDGET = num(process.env.AGENT402_BUDGET) ?? Infinity;\nlet spentUsd = 0;',
  'const BUDGET = num(process.env.AGENT402_BUDGET) ?? Infinity;\nlet spentUsd = 0;\n' + constants
);

const helper = `
async function callIndustrialPlatform(toolName, args = {}) {
  const tool = INDUSTRIAL_PLATFORM_TOOLS[toolName];
  if (!tool) throw new Error(\`Unknown Industrial Platform tool "\${toolName}"\`);
  if (!HAS_WALLET) {
    return {
      content: [{ type: "text", text: \`\${toolName} requires a funded Agent402 wallet (AGENT_KEY or SOLANA_AGENT_KEY).\` }],
      isError: true,
    };
  }

  const url = new URL(\`\${INDUSTRIAL_PLATFORM_BASE}\${tool.path}\`);
  const body = { ...args };
  if (toolName === "monitor_webpage" && typeof body.url === "string" && !body.previous_hash) {
    const remembered = industrialMonitorHashes.get(body.url);
    if (remembered) body.previous_hash = remembered;
  }

  const init = { method: tool.method, headers: { Accept: "application/json" } };
  if (tool.method === "GET") {
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  } else {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const price = await quotedUsd(url, init, 0.001);
  if (price > MAX_PER_CALL) {
    return { content: [{ type: "text", text: \`Refused: Industrial Platform quoted $\${price}, above AGENT402_MAX_PER_CALL $\${MAX_PER_CALL}.\` }], isError: true };
  }
  if (spentUsd + price > BUDGET) {
    return { content: [{ type: "text", text: \`Refused: Agent402 session budget exhausted ($\${spentUsd.toFixed(4)} of $\${BUDGET}).\` }], isError: true };
  }

  const payFetch = await getPayFetch();
  const res = await payFetch(url, init);
  const text = await res.text();
  if (!res.ok) return { content: [{ type: "text", text: failureText(res.status, text) }], isError: true };
  spentUsd += price;

  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (toolName === "monitor_webpage" && typeof body.url === "string" && typeof parsed?.current_hash === "string") {
    industrialMonitorHashes.set(body.url, parsed.current_hash);
  }
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      provider: "industrial-platform",
      endpoint: \`\${INDUSTRIAL_PLATFORM_BASE}\${tool.path}\`,
      priceUsd: price,
      result: parsed
    }
  };
}
`;

const helperAnchor = '// ---------------------------------------------------------------------------\n// Tool search over the full catalog';
if (!src.includes(helperAnchor)) {
  console.error("Agent402 tool-search anchor not found; refusing to patch.");
  process.exit(5);
}
src = src.replace(helperAnchor, helper + '\n' + helperAnchor);

const listAnchor = `  tools.push(
    {
      name: META_MCP_NAMES.search_tools,`;
if (!src.includes(listAnchor)) {
  console.error("Agent402 tools/list anchor not found; refusing to patch.");
  process.exit(6);
}
src = src.replace(
  listAnchor,
  `  tools.push(
    ...Object.entries(INDUSTRIAL_PLATFORM_TOOLS).map(([name, tool]) => ({
      name,
      title: tool.title,
      annotations: { title: tool.title, ...OPEN },
      description: \`[\${tool.price}/call; native Industrial Platform provider] \${tool.description}\`,
      inputSchema: tool.inputSchema,
      outputSchema: { type: "object", additionalProperties: true }
    })),
    {
      name: META_MCP_NAMES.search_tools,`
);

const callAnchor = `  try {
    if (name === "catalog.search") {`;
if (!src.includes(callAnchor)) {
  console.error("Agent402 CallTool anchor not found; refusing to patch.");
  process.exit(7);
}
src = src.replace(
  callAnchor,
  `  try {
    if (INDUSTRIAL_PLATFORM_TOOLS[name]) {
      return await callIndustrialPlatform(name, args);
    }
    if (name === "catalog.search") {`
);

const backup = target + ".before-industrial-platform";
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
fs.writeFileSync(target, src);
console.log("Installed Industrial Platform as four first-class Agent402 MCP tools.");
console.log("Native tools: url_to_markdown, monitor_webpage, extract_web_metadata, wallet_balance");
console.log("Backup:", backup);
console.log("Next: run Agent402 MCP tests/CI, then publish/deploy the patched runtime.");
