#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), "config/tools.json");
if (!fs.existsSync(target)) {
  console.error("Expected config/tools.json in current directory. Run this from the root of nirholas/x402-mcp-commerce.");
  process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(target, "utf8"));
if (!Array.isArray(doc.tools)) {
  console.error("config/tools.json does not contain a tools array; refusing to modify an unknown schema.");
  process.exit(3);
}

const baseUrl = "https://x402-gateway-production-1f21.up.railway.app";
const additions = [
  {
    name:"url_to_markdown",
    description:"Convert a public webpage URL to clean Markdown for RAG, grounding, research, summarization and LLM context.",
    upstream:"industrial-platform",
    baseUrl,
    method:"POST",
    path:"/web/markdown",
    price:"$0.001",
    input:{
      url:{type:"string",required:true,description:"Public http(s) webpage URL."},
      max_chars:{type:"number",description:"Maximum Markdown characters to return, up to 150000."},
      timeout_seconds:{type:"number",description:"Fetch timeout in seconds, 5-60."}
    },
    rail:"evm"
  },
  {
    name:"monitor_webpage",
    description:"Detect meaningful webpage changes for prices, inventory, availability, documentation, policies and competitor monitoring.",
    upstream:"industrial-platform",
    baseUrl,
    method:"POST",
    path:"/change",
    price:"$0.001",
    input:{
      url:{type:"string",required:true,description:"Public webpage URL to inspect."},
      previous_hash:{type:"string",description:"Prior deterministic hash. Persist current_hash and pass it here on the next scheduled run."},
      previous_text:{type:"string",description:"Optional prior text for diff generation."},
      include_current_text:{type:"boolean",description:"Include current normalized text in the response."},
      timeout_seconds:{type:"number",description:"Fetch timeout in seconds, 5-60."}
    },
    rail:"evm"
  },
  {
    name:"extract_web_metadata",
    description:"Extract title, description, canonical URL, robots directives, headings, OpenGraph, Twitter cards and JSON-LD for one public URL.",
    upstream:"industrial-platform",
    baseUrl,
    method:"POST",
    path:"/metadata-single",
    price:"$0.001",
    input:{
      url:{type:"string",required:true,description:"Public http(s) webpage URL."},
      timeout_seconds:{type:"number",description:"Fetch timeout in seconds, 5-60."}
    },
    rail:"evm"
  },
  {
    name:"wallet_balance",
    description:"Return native ETH and USDC balances for one wallet on Base or Ethereum.",
    upstream:"industrial-platform",
    baseUrl,
    method:"GET",
    path:"/wallet-balance/cdp",
    price:"$0.001",
    query:["address","chain"],
    input:{
      address:{type:"string",required:true,description:"20-byte EVM wallet address."},
      chain:{type:"string",description:"CAIP-2 chain id; eip155:8453 for Base or eip155:1 for Ethereum."}
    },
    rail:"evm"
  }
];

const names = new Set(additions.map(x => x.name));
doc.tools = [...additions, ...doc.tools.filter(x => !names.has(x?.name))];

const backup = target + ".before-industrial-platform";
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
fs.writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
console.log("Installed Industrial Platform native tools:", additions.map(x=>x.name).join(", "));
console.log("Backup:", backup);
console.log("Next: run npm test / project CI, then deploy or publish the updated runtime.");
