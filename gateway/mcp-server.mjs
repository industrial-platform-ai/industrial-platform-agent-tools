import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createPaymentWrapper, x402ResourceServer } from '@x402/mcp';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { BatchSettlementEvmScheme } from '@x402/evm/batch-settlement/server';
import { FileChannelStorage } from '@x402/evm/batch-settlement/server/file-storage';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';

import { runMetadata } from './metadata.mjs';
import { runChange } from './change.mjs';
import { utilityTools } from './utilities.mjs';
import { marketTools } from './market.mjs';
import { documentTools } from './article.mjs';
import { networkTools } from './network.mjs';
import { bundleTools } from './bundles.mjs';
import { agenticTools } from './agentic.mjs';
import { cryptoAgentTools } from './crypto-agent.mjs';
import { canonicalTools, canonicalWalletBalance, canonicalGasPrice } from './canonical.mjs';
import { adoptionTools } from './adoption.mjs';

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.MCP_PUBLIC_ORIGIN || 'https://x402-mcp-gateway-production.up.railway.app';
const PAY_TO = process.env.X402_PAY_TO || '0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E';
const NETWORK = 'eip155:8453';
const BATCH_STORAGE_DIR = process.env.X402_BATCH_STORAGE_DIR || '/data/batch-channels';
const BATCH_ROUTE_SET = new Set([
  '/agent/wallet-monitor',
  '/wallet-balance',
  '/wallet-activity',
  '/chain/wallet-activity',
  '/transaction-status',
  '/chain/transaction-status',
  '/agent/transaction-watch',
  '/agent/treasury-snapshot',
  '/agent/pretrade',
  '/crypto/snapshot',
  '/crypto/spot-price',
  '/crypto/ohlcv',
  '/crypto/candles',
  '/crypto/price',
  '/crypto/book',
  '/gas-price',
  '/gas-state',
  '/chain/gas-state',
  '/change',
  '/web/monitor',
  '/x402/adoption-search'
]);

const metadataInputSchema = {
  type:'object',
  properties:{
    urls:{type:'array',items:{type:'string',format:'uri'},minItems:1,maxItems:1,description:'Exactly one public URL per paid request.'},
    timeout_seconds:{type:'integer',minimum:5,maximum:60},
    concurrency:{type:'integer',minimum:1,maximum:20}
  },
  required:['urls'],
  additionalProperties:false
};

const changeInputSchema = {
  type:'object',
  properties:{
    url:{type:'string',format:'uri'},
    previous_hash:{type:'string'},
    previous_text:{type:'string'},
    selector:{type:'string'},
    ignore_selectors:{type:'array',items:{type:'string'}},
    include_current_text:{type:'boolean'},
    max_text_chars:{type:'integer',minimum:1000,maximum:250000},
    max_diff_chars:{type:'integer',minimum:1000,maximum:50000},
    timeout_seconds:{type:'integer',minimum:5,maximum:60}
  },
  required:['url'],
  additionalProperties:false
};

const dynamicTools = [...utilityTools, ...marketTools, ...documentTools, ...networkTools, ...bundleTools, ...agenticTools, ...cryptoAgentTools, ...canonicalTools, ...adoptionTools];

const readResult = async (body) => {
  const result = await runChange({...body, include_current_text:true});
  return {
    status:result.status,
    url:result.url,
    final_url:result.final_url,
    fetched_at:result.checked_at,
    http_status:result.http_status,
    content_type:result.content_type,
    title:result.title,
    selector:result.selector,
    text:result.current_text,
    text_length:result.text_length,
    original_text_length:result.original_text_length,
    text_truncated:result.text_truncated,
    content_hash:result.current_hash,
    fetch:result.fetch
  };
};

const markdownTool = dynamicTools.find(t=>t.route==='/web/markdown');
const remainingDynamicTools = dynamicTools.filter(t=>t.route!=='/web/markdown');

const dynamicToolByName = new Map(dynamicTools.map(t=>[t.name,t]));

const recurringMcpAliasSpecs = [
  {name:'monitor_wallet',source:'agent-wallet-monitor',description:'Monitor a wallet for balance changes and new USDC/ERC-20 activity. Recurring paid primitive; repeat about every 60 seconds while monitoring is active.'},
  {name:'wallet_activity',source:'chain-wallet-activity',description:'Read recent wallet ERC-20/USDC activity with cursor state for recurring payment and deposit monitoring.'},
  {name:'transaction_status',source:'chain-transaction-status',description:'Check whether an EVM transaction is pending, confirmed or reverted.'},
  {name:'watch_transaction',source:'agent-transaction-watch',description:'Poll a transaction about every 15 seconds until confirmed or reverted, reusing returned next-check state.'},
  {name:'treasury_snapshot',source:'agent-treasury-snapshot',description:'Recurring treasury/accounting snapshot with balances, gas and recent token activity; repeat about every five minutes while active.'},
  {name:'pretrade_context',source:'agent-pretrade-context',description:'Refresh wallet, allowance, gas, price, 24h statistics and top-of-book context immediately before each automated trade or payment.'},
  {name:'crypto_candles',source:'crypto-candles',description:'Recurring OHLCV candle data for trading, indicators and market monitoring.'},
  {name:'crypto_price',source:'crypto-price',description:'Recurring realtime crypto price lookup for autonomous trading and monitoring.'},
  {name:'crypto_book',source:'crypto-top-of-book',description:'Recurring best-bid/best-ask market data for autonomous execution and spread monitoring.'},
  {name:'market_snapshot',source:'crypto-market-snapshot',description:'Recurring bundled crypto market snapshot for autonomous trading and market-monitoring loops.'}
];

const recurringMcpAliases = recurringMcpAliasSpecs.map(spec=>{
  const source=dynamicToolByName.get(spec.source);
  if(!source) throw new Error('Missing recurring MCP alias source: '+spec.source);
  return {
    name:spec.name,
    route:source.route,
    priceUsd:source.priceUsd,
    price:source.price,
    description:spec.description,
    inputSchema:source.inputSchema,
    example:source.example,
    run:source.run
  };
});

const canonicalMcpAliases = [
  {
    name:'wallet_balance',
    route:'/wallet-balance',
    priceUsd:0.001,
    price:'$0.001',
    description:'Canonical wallet balance for Base or Ethereum. Returns native ETH and USDC balances for one address and is suitable for recurring wallet and treasury polling.',
    inputSchema:{
      type:'object',
      properties:{
        address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},
        chain:{type:'string',enum:['eip155:8453','eip155:1'],default:'eip155:8453'}
      },
      required:['address'],
      additionalProperties:false
    },
    example:{address:'0x0000000000000000000000000000000000000000',chain:'eip155:8453'},
    run:canonicalWalletBalance
  },
  {
    name:'gas_price',
    route:'/gas-price',
    priceUsd:0.001,
    price:'$0.001',
    description:'Canonical current EVM base fee in gwei for Base or Ethereum, for recurring transaction timing and execution checks.',
    inputSchema:{
      type:'object',
      properties:{chain:{type:'string',enum:['eip155:8453','eip155:1'],default:'eip155:8453'}},
      additionalProperties:false
    },
    example:{chain:'eip155:8453'},
    run:canonicalGasPrice
  },
  {
    name:'monitor_webpage_change',
    route:'/change',
    priceUsd:0.001,
    price:'$0.001',
    description:'Recurring webpage change monitoring for prices, inventory, availability, documentation, policies and competitors. Reuse the returned previous_hash on the next check.',
    inputSchema:changeInputSchema,
    example:{url:'https://example.com/',include_current_text:false},
    run:runChange
  }
];

const tools = [
  {
    name:'detectWebpageChange',
    route:'/change',
    priceUsd:0.001,
    description:'Detect whether a webpage changed. Compare current content against a previous hash or previous text and return deterministic hashes and diffs.',
    inputSchema:changeInputSchema,
    example:{url:'https://example.com/',include_current_text:false},
    run:runChange
  },
  ...(markdownTool ? [{
    name:'convertUrlToMarkdown',
    route:markdownTool.route,
    priceUsd:markdownTool.priceUsd,
    price:markdownTool.price,
    description:'Convert URL to clean Markdown for RAG. Convert a public webpage URL into clean agent-ready Markdown for grounding, research, summarization and LLM context.',
    inputSchema:markdownTool.inputSchema,
    example:markdownTool.example,
    run:markdownTool.run
  }] : []),
  {
    name:'extractWebpageMetadata',
    route:'/metadata',
    priceUsd:0.001,
    description:'Extract webpage metadata, OpenGraph and JSON-LD. Returns title, description, canonical URL, robots directives, headings, Open Graph, Twitter cards and structured data for one public URL per paid request.',
    inputSchema:metadataInputSchema,
    example:{urls:['https://example.com/']},
    run:runMetadata
  },
  {
    name:'web-reader',
    route:'/read',
    priceUsd:0.001,
    description:'Fetch a public URL and extract clean normalized readable text for RAG, research and LLM context.',
    inputSchema:changeInputSchema,
    example:{url:'https://example.com/'},
    run:readResult
  },
  ...remainingDynamicTools.map(t=>({
    name:t.name,
    route:t.route,
    priceUsd:t.priceUsd,
    price:t.price,
    description:t.description,
    inputSchema:t.inputSchema,
    example:t.example,
    run:t.run
  })),
  ...recurringMcpAliases,
  ...canonicalMcpAliases
];

const toolByName = new Map(tools.map(tool=>[tool.name,tool]));
const MCP_PROFILES = {
  'wallet-monitor':['monitor_wallet','wallet_balance','wallet_activity','gas_price'],
  'transaction-watch':['watch_transaction','transaction_status','gas_price'],
  'treasury':['treasury_snapshot','wallet_balance','wallet_activity','gas_price'],
  'pretrade':['pretrade_context','crypto_price','crypto_book','market_snapshot','wallet_balance','gas_price'],
  'market-data':['crypto_price','crypto_candles','crypto_book','market_snapshot'],
  'web-monitor':['monitor_webpage_change','detectWebpageChange','extractWebpageMetadata']
};
for (const [profile,names] of Object.entries(MCP_PROFILES)) {
  for (const name of names) {
    if (!toolByName.has(name)) throw new Error('Missing MCP profile tool '+profile+': '+name);
  }
}

function schemaToZod(schema = {}) {
  if (schema.enum) {
    const vals = schema.enum.map(String);
    if (vals.length === 1) return z.literal(vals[0]);
    return z.enum(vals);
  }

  let out;
  switch (schema.type) {
    case 'string':
      out = z.string();
      if (Number.isFinite(schema.minLength)) out = out.min(schema.minLength);
      if (Number.isFinite(schema.maxLength)) out = out.max(schema.maxLength);
      if (schema.pattern) out = out.regex(new RegExp(schema.pattern));
      if (schema.format === 'uri') out = out.url();
      break;
    case 'integer':
      out = z.number().int();
      if (Number.isFinite(schema.minimum)) out = out.min(schema.minimum);
      if (Number.isFinite(schema.maximum)) out = out.max(schema.maximum);
      break;
    case 'number':
      out = z.number();
      if (Number.isFinite(schema.minimum)) out = out.min(schema.minimum);
      if (Number.isFinite(schema.maximum)) out = out.max(schema.maximum);
      break;
    case 'boolean':
      out = z.boolean();
      break;
    case 'array':
      out = z.array(schemaToZod(schema.items || {}));
      if (Number.isFinite(schema.minItems)) out = out.min(schema.minItems);
      if (Number.isFinite(schema.maxItems)) out = out.max(schema.maxItems);
      break;
    case 'object': {
      const required = new Set(schema.required || []);
      const shape = {};
      for (const [key, value] of Object.entries(schema.properties || {})) {
        const field = schemaToZod(value);
        shape[key] = required.has(key) ? field : field.optional();
      }
      out = z.object(shape);
      if (schema.additionalProperties !== false) out = out.passthrough();
      break;
    }
    default:
      out = z.any();
  }

  if (schema.description && typeof out.describe === 'function') out = out.describe(schema.description);
  return out;
}

const facilitator = createCdpFacilitatorClient();
const resourceServer = new x402ResourceServer(facilitator);
const batchScheme = new BatchSettlementEvmScheme(PAY_TO, {
  storage:new FileChannelStorage({directory:BATCH_STORAGE_DIR}),
  enforceMinDeposit:false
});
resourceServer.register(NETWORK, new ExactEvmScheme());
resourceServer.register(NETWORK, batchScheme);
await resourceServer.initialize();

const batchManager = batchScheme.createChannelManager(facilitator, NETWORK);
batchManager.start({
  claimIntervalSecs:60,
  settleIntervalSecs:300,
  refundIntervalSecs:3600,
  maxClaimsPerBatch:100
});

const acceptsByTool = new Map();
for (const tool of tools) {
  const price=tool.price || tool.priceUsd;
  const exact=await resourceServer.buildPaymentRequirements({
    scheme:'exact',
    network:NETWORK,
    payTo:PAY_TO,
    price
  });
  const accepts=[...exact];
  if (BATCH_ROUTE_SET.has(tool.route)) {
    const batch=await resourceServer.buildPaymentRequirements({
      scheme:'batch-settlement',
      network:NETWORK,
      payTo:PAY_TO,
      price
    });
    accepts.push(...batch);
  }
  acceptsByTool.set(tool.name, accepts);
}

function createServer(selectedTools=tools, serverName='industrial-platform-direct-x402') {
  const server = new McpServer({
    name:serverName,
    version:'1.0.0'
  });

  for (const tool of selectedTools) {
    const discovery = declareDiscoveryExtension({
      toolName:tool.name,
      description:tool.description,
      transport:'streamable-http',
      inputSchema:tool.inputSchema,
      example:tool.example || {}
    });

    const paid = createPaymentWrapper(resourceServer, {
      accepts:acceptsByTool.get(tool.name),
      resource:{
        url:'mcp://tool/'+tool.name,
        description:tool.description
      },
      extensions:discovery
    });

    server.tool(
      tool.name,
      tool.description+' Costs '+(tool.price || ('$'+Number(tool.priceUsd).toFixed(6).replace(/0+$/,'').replace(/\.$/,'')))+' USDC on Base via x402.',
      schemaToZod(tool.inputSchema).shape,
      paid(async (args) => {
        const data = await tool.run(args);
        return {
          content:[{type:'text',text:JSON.stringify(data)}],
          structuredContent:data && typeof data === 'object' ? data : {value:data}
        };
      })
    );
  }

  return server;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));

app.get('/', (_req,res)=>res.json({
  name:'Industrial Platform Direct x402 MCP',
  protocol:'MCP Streamable HTTP',
  payment:{protocol:'x402',version:2,network:NETWORK,asset:'USDC',payTo:PAY_TO},
  toolCount:tools.length,
  endpoint:ORIGIN+'/mcp',
  profiles:Object.fromEntries(Object.keys(MCP_PROFILES).map(profile=>[profile,ORIGIN+'/mcp/'+profile])),
  catalog:'https://x402-gateway-production-1f21.up.railway.app/.well-known/x402'
}));

app.get('/health', (_req,res)=>res.json({
  ok:true,
  toolCount:tools.length,
  network:NETWORK,
  profiles:Object.fromEntries(Object.entries(MCP_PROFILES).map(([profile,names])=>[profile,{endpoint:ORIGIN+'/mcp/'+profile,toolCount:names.length,tools:names}])),
  batchSettlement:{enabled:true,storage:'durable-file',routes:[...BATCH_ROUTE_SET]}
}));

app.get('/profiles', (_req,res)=>res.json({
  profiles:Object.fromEntries(Object.entries(MCP_PROFILES).map(([profile,names])=>[
    profile,
    {endpoint:ORIGIN+'/mcp/'+profile,tools:names}
  ]))
}));

app.all(['/mcp','/mcp/:profile'], async (req,res)=>{
  const profile=req.params.profile;
  if (profile && !MCP_PROFILES[profile]) {
    return res.status(404).json({error:'Unknown MCP profile',profiles:Object.keys(MCP_PROFILES)});
  }
  const selectedTools=profile ? MCP_PROFILES[profile].map(name=>toolByName.get(name)) : tools;
  const server = createServer(selectedTools, profile ? 'industrial-platform-'+profile : 'industrial-platform-direct-x402');
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  res.on('close',()=>{ void server.close().catch(()=>{}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  } catch (error) {
    console.error('MCP_REQUEST_FAILED',error);
    if (!res.headersSent) res.status(500).json({error:'MCP request failed'});
  }
});

app.listen(PORT,'0.0.0.0',()=>{
  console.log('Industrial Platform direct x402 MCP listening on',PORT,'tools',tools.length);
});
