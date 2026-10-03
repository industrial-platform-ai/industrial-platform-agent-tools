import express from 'express';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';
import { createPaywall } from '@x402/paywall';
import { evmPaywall } from '@x402/paywall/evm';
import { runMetadata } from './metadata.mjs';
import { runChange } from './change.mjs';
import { utilityTools } from './utilities.mjs';
import { marketTools } from './market.mjs';
import { documentTools } from './article.mjs';
import { networkTools } from './network.mjs';
import { bundleTools } from './bundles.mjs';
import { agenticTools } from './agentic.mjs';

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = 'https://x402-gateway-production-1f21.up.railway.app';
const DIRECT_MCP = 'https://x402-mcp-gateway-production.up.railway.app/mcp';
const PAY_TO = process.env.X402_PAY_TO || '0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E';
const PRICE = '$0.001';
const NETWORK = 'eip155:8453';
const NETWORKS = ['eip155:8453'];
const NETWORK_ASSETS = {
  'eip155:8453':'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'eip155:137':'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'eip155:42161':'0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
};
const acceptsFor = (price) => NETWORKS.map(network=>({
  scheme:'exact',
  price,
  network,
  payTo:PAY_TO,
  maxTimeoutSeconds:90
}));
const dynamicTools = [...utilityTools, ...marketTools, ...documentTools, ...networkTools, ...bundleTools, ...agenticTools];
const PRIORITY_ROUTES = ['/change','/web/markdown','/metadata','/web/monitor'];
const PRIORITY_ROUTE_SET = new Set(PRIORITY_ROUTES);
const INTERNAL_PAYER_ADDRESSES = new Set(
  String(process.env.X402_INTERNAL_PAYER_ADDRESSES || '')
    .split(',')
    .map(v=>v.trim().toLowerCase())
    .filter(Boolean)
);
const funnelState = {
  startedAt:new Date().toISOString(),
  challenges:0,
  paymentRetries:0,
  paidCompletions:0,
  settlements:0,
  settledAtomic:0,
  distinctPayers:new Set(),
  distinctExternalPayers:new Set(),
  byRoute:{}
};
function routeFunnel(path) {
  return funnelState.byRoute[path] ||= {challenges:0,paymentRetries:0,paidCompletions:0};
}

const BASE_BLOCKSCOUT = 'https://base.blockscout.com/api/v2';
const X402_SETTLEMENT_METHODS = new Set(['0xe3ee160e','0xcf092995','transferwithauthorization']);
const AGENT402_ROUTE_API = 'https://agent402.tools/api/route';
const ROUTING_QUERIES = [
  {route:'/change',query:'detect whether a webpage changed'},
  {route:'/web/markdown',query:'convert URL to clean Markdown for RAG'},
  {route:'/metadata',query:'extract webpage metadata OpenGraph JSON-LD'},
  {route:'/web/monitor',query:'monitor a webpage for changes price inventory availability'},
  {route:'/hash',query:'compute sha256 hash'},
  {route:'/base64',query:'base64 encode decode'},
  {route:'/crypto/price',query:'crypto price'},
  {route:'/uuid/generate',query:'uuid generate'},
  {route:'/unit/convert',query:'unit conversion'},
  {route:'/timezone/convert',query:'timezone convert'}
];

function normalizeAddress(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

async function fetchJson(url,{timeoutMs=15000}={}) {
  const response = await fetch(url,{
    headers:{accept:'application/json','user-agent':'IndustrialPlatform-Observability/1.0'},
    signal:AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('HTTP '+response.status+' from '+new URL(url).host);
  return response.json();
}

async function readOnchainSettlementWindow(hours=24) {
  const end = new Date();
  const start = new Date(end.getTime() - hours*60*60*1000);
  const payTo = normalizeAddress(PAY_TO);
  const usdc = normalizeAddress(NETWORK_ASSETS[NETWORK]);
  const url = BASE_BLOCKSCOUT+'/addresses/'+encodeURIComponent(PAY_TO)+'/token-transfers?type=ERC-20';
  const data = await fetchJson(url);
  const rows = Array.isArray(data?.items) ? data.items : [];

  const facilitated = rows.filter(row=>{
    const timestamp = Date.parse(row?.timestamp || '');
    const token = normalizeAddress(row?.token?.address_hash);
    const to = normalizeAddress(row?.to?.hash);
    const method = String(row?.method || '').toLowerCase();
    return Number.isFinite(timestamp)
      && timestamp >= start.getTime()
      && timestamp <= end.getTime()
      && token === usdc
      && to === payTo
      && X402_SETTLEMENT_METHODS.has(method);
  });

  const transfers = facilitated.map(row=>{
    const payer = normalizeAddress(row?.from?.hash);
    const atomic = Number(row?.total?.value || 0);
    const internal = Boolean(payer && INTERNAL_PAYER_ADDRESSES.has(payer));
    return {
      timestamp:row.timestamp,
      payer,
      internal,
      amountAtomic:Number.isFinite(atomic)?atomic:0,
      amountUsdc:Number.isFinite(atomic)?atomic/1_000_000:0,
      transaction:row.transaction_hash || null
    };
  });

  const external = transfers.filter(row=>!row.internal);
  const externalPayers = [...new Set(external.map(row=>row.payer).filter(Boolean))];
  const externalAtomic = external.reduce((sum,row)=>sum+row.amountAtomic,0);
  const allAtomic = transfers.reduce((sum,row)=>sum+row.amountAtomic,0);

  return {
    source:'Base Blockscout public ERC-20 transfer index',
    windowHours:hours,
    windowStart:start.toISOString(),
    windowEnd:end.toISOString(),
    network:NETWORK,
    asset:'USDC',
    assetAddress:NETWORK_ASSETS[NETWORK],
    payTo:PAY_TO,
    methodFilter:[...X402_SETTLEMENT_METHODS],
    settlementTransferCount:transfers.length,
    excludedInternalTransferCount:transfers.length-external.length,
    externalFacilitatedTransferCount:external.length,
    distinctExternalPayerCount:externalPayers.length,
    externalPayers,
    receivedAtomic:allAtomic,
    receivedUsdc:allAtomic/1_000_000,
    externalAtomic,
    externalUsdc:externalAtomic/1_000_000,
    transfers
  };
}

async function readAgent402Routing() {
  const results = [];
  for (const target of ROUTING_QUERIES) {
    try {
      const url=AGENT402_ROUTE_API+'?include=external&q='+encodeURIComponent(target.query);
      const body=await fetchJson(url);
      const matches=Array.isArray(body?.results)?body.results:[];
      const index=matches.findIndex(row=>row?.seller===ORIGIN && row?.route===target.route);
      const row=index>=0?matches[index]:null;
      results.push({
        route:target.route,
        query:target.query,
        rank:index>=0?index+1:null,
        returned:body?.returned ?? matches.length,
        found:Boolean(row),
        priceUsd:row?.priceUsd ?? row?.price ?? null,
        score:row?.score ?? null,
        routerDispatchEligible:row?.routerDispatchEligible ?? null,
        routerDispatchReason:row?.routerDispatchReason ?? null,
        routerDispatchByChain:row?.routerDispatchByChain ?? null,
        executeViaCallableNow:row?.executeViaCallableNow ?? null,
        marketplaceCalls30d:row?.bazaar?.calls30d ?? null,
        marketplaceReportedPayers30d:row?.bazaar?.payers30d ?? null,
        lastCalledAt:row?.bazaar?.lastCalledAt ?? null
      });
    } catch(error) {
      results.push({
        route:target.route,
        query:target.query,
        found:false,
        error:String(error?.message||error)
      });
    }
  }
  return {
    source:'Agent402 public route API',
    warning:'marketplaceReportedPayers30d is not an organic-payer count; controlled/internal wallets may be included.',
    routes:results,
    anyRouterDispatchEligible:results.some(row=>row.routerDispatchEligible===true)
  };
}

const paymentRequiredHeader = {
  description:'Base64-encoded x402 v2 PaymentRequired object. Decode this header, sign the selected requirement with a caller-controlled wallet, and retry the same request with PAYMENT-SIGNATURE.',
  schema:{type:'string'}
};

const paymentResponseHeader = {
  description:'Base64-encoded x402 v2 settlement response returned after a successful paid request.',
  schema:{type:'string'}
};

const paidSuccess = (description, content) => ({
  description,
  headers:{'PAYMENT-RESPONSE':paymentResponseHeader},
  ...(content ? {content} : {})
});

const paymentRequired = {
  description:'x402 v2 payment required. Protocol details are carried in the PAYMENT-REQUIRED response header.',
  headers:{'PAYMENT-REQUIRED':paymentRequiredHeader}
};

function summarizePaymentRequiredHeader(value) {
  if (!value) return null;
  try {
    const raw=Array.isArray(value)?value[0]:String(value);
    const decoded=JSON.parse(Buffer.from(raw,'base64').toString('utf8'));
    return {
      x402Version:decoded.x402Version ?? decoded.version ?? null,
      resource:decoded.resource ? {
        url:decoded.resource.url ?? null,
        description:decoded.resource.description ?? null,
        mimeType:decoded.resource.mimeType ?? null
      } : null,
      accepts:Array.isArray(decoded.accepts) ? decoded.accepts.map(x=>({
        scheme:x.scheme ?? null,
        network:x.network ?? null,
        amount:x.amount ?? null,
        asset:x.asset ?? null,
        payTo:x.payTo ?? null,
        maxTimeoutSeconds:x.maxTimeoutSeconds ?? null,
        extraKeys:x.extra && typeof x.extra==='object' ? Object.keys(x.extra) : []
      })) : [],
      extensionKeys:decoded.extensions && typeof decoded.extensions==='object' ? Object.keys(decoded.extensions) : []
    };
  } catch (error) {
    return {decodeError:String(error?.message||error)};
  }
}

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

const metadataDiscovery = declareDiscoveryExtension({
  input:{urls:['https://example.com/']},
  inputSchema:metadataInputSchema,
  bodyType:'json',
  output:{
    example:{
      summary:{status:'ready',requested:1,succeeded:1,failed:0},
      results:[{status:'ready',url:'https://example.com/',title:'Example Domain'}]
    }
  }
});

const utilityDiscovery = (tool) => declareDiscoveryExtension({
  input:tool.example,
  inputSchema:tool.inputSchema,
  bodyType:'json',
  output:{example:{status:'ready'}}
});

const changeDiscovery = declareDiscoveryExtension({
  input:{url:'https://example.com/',include_current_text:false},
  inputSchema:changeInputSchema,
  bodyType:'json',
  output:{
    example:{
      status:'ready',
      url:'https://example.com/',
      comparison_status:'baseline',
      current_hash:'example'
    }
  }
});

const manifest = {
  name:'Industrial Platform Agent Utility Market',
  description:'Low-cost x402 machine utilities for autonomous agents: SHA-256 hashing, Base64/hex conversion, UUID generation, unit conversion, timezone conversion, realtime crypto market data, webpage/document extraction, URL-to-Markdown, metadata, RAG preparation and deterministic website change detection.',
  payment:{protocol:'x402',network:NETWORK,networks:NETWORKS,asset:'USDC',priceUsd:0.001,payTo:PAY_TO},
  tools:[
    {
      name:'extractWebpageMetadata',
      method:'POST',
      route:'/metadata',
      priceUsd:0.001,
      description:'Extract webpage metadata, OpenGraph and JSON-LD. Returns title, description, canonical URL, robots directives, headings, Open Graph, Twitter cards and structured data for one public URL per paid request.',
      inputSchema:metadataInputSchema
    },
    {
      name:'detectWebpageChange',
      method:'POST',
      route:'/change',
      priceUsd:0.001,
      description:'Detect whether a webpage changed. Compare current content against a previous hash or previous text and return deterministic hashes and diffs for price, inventory, availability, documentation, policy and competitor monitoring.',
      inputSchema:changeInputSchema
    },
    {
      name:'web-reader',
      method:'POST',
      route:'/read',
      priceUsd:0.001,
      description:'Fetch a public URL and extract clean normalized readable text from HTML, JSON, XML, CSV, JavaScript or plain-text responses. Use for web reading, document text extraction, RAG ingestion, summarization, research and LLM context.',
      inputSchema:changeInputSchema
    },
    ...dynamicTools.map(t=>({
      name:t.route==='/web/markdown' ? 'convertUrlToMarkdown' : t.name,
      method:'POST',
      route:t.route,
      priceUsd:t.priceUsd,
      summary:t.route==='/web/markdown'
        ? 'Convert URL to clean Markdown for RAG'
        : (t.summary || t.description),
      description:t.route==='/web/markdown'
        ? 'Convert URL to clean Markdown for RAG. Convert a public webpage URL into clean agent-ready Markdown for grounding, research, summarization and LLM context.'
        : t.description,
      inputSchema:t.inputSchema
    }))
  ]
};

manifest.version = 1;
manifest.priorityRoutes = PRIORITY_ROUTES.map((route,index)=>{
  const tool=manifest.tools.find(t=>t.route===route);
  return tool ? {
    rank:index+1,
    route,
    name:tool.name,
    priceUsd:tool.priceUsd,
    description:tool.description
  } : {rank:index+1,route};
});
manifest.tools = manifest.tools.map(t=>({
  ...t,
  recommended:PRIORITY_ROUTE_SET.has(t.route),
  priority:PRIORITY_ROUTE_SET.has(t.route) ? PRIORITY_ROUTES.indexOf(t.route)+1 : null
}));
manifest.resources = manifest.tools.map(t=>ORIGIN+t.route);

const openapi = {
  openapi:'3.1.0',
  info:{
    title:'Industrial Platform Web Tools',
    version:'2.0.0',
    description:'Machine-payable x402 utilities for hashing, Base64, UUID generation, unit and timezone conversion, realtime crypto market data, webpage/document extraction, URL-to-Markdown, metadata, RAG ingestion and deterministic website change detection.',
    contact:{
      name:'Industrial Platform',
      email:'art@naturalist.gallery',
      url:'https://github.com/industrial-platform-ai/industrial-platform-agent-tools'
    }
  },
  servers:[{url:ORIGIN}],
  'x-x402':{
    version:2,
    transport:'http',
    network:NETWORK,
    asset:'USDC',
    challengeHeader:'PAYMENT-REQUIRED',
    paymentHeader:'PAYMENT-SIGNATURE',
    settlementHeader:'PAYMENT-RESPONSE',
    directMcp:DIRECT_MCP,
    flow:[
      'Send the POST request without payment.',
      'On HTTP 402, decode PAYMENT-REQUIRED and select an advertised requirement.',
      'Sign the payment with the caller wallet and retry the identical request with PAYMENT-SIGNATURE.',
      'On success, consume the resource and PAYMENT-RESPONSE settlement metadata.'
    ]
  },
  paths:{
    '/metadata':{
      post:{
        operationId:'extractWebpageMetadata',
        'x-payment-info':{
          protocols:['x402'],
          price:{mode:'fixed',currency:'USD',amount:String(manifest.tools[0].priceUsd)}
        },
        summary:'Extract webpage metadata, OpenGraph and JSON-LD',
        description:manifest.tools[0].description,
        requestBody:{required:true,content:{'application/json':{schema:metadataInputSchema}}},
        responses:{
          '200':paidSuccess('Metadata result'),
          '400':{description:'Invalid input'},
          '402':paymentRequired,
          '502':{description:'Target fetch failed'}
        }
      }
    },
    '/change':{
      post:{
        operationId:'detectWebpageChange',
        'x-payment-info':{
          protocols:['x402'],
          price:{mode:'fixed',currency:'USD',amount:String(manifest.tools[1].priceUsd)}
        },
        summary:'Detect whether a webpage changed',
        description:manifest.tools[1].description,
        requestBody:{required:true,content:{'application/json':{schema:changeInputSchema}}},
        responses:{
          '200':paidSuccess('Change comparison result'),
          '400':{description:'Invalid input'},
          '402':paymentRequired,
          '502':{description:'Target fetch failed'}
        }
      }
    },
    '/read':{
      post:{
        operationId:'webReader',
        'x-payment-info':{
          protocols:['x402'],
          price:{mode:'fixed',currency:'USD',amount:String(manifest.tools[2].priceUsd)}
        },
        summary:'Read a public URL as normalized text',
        description:manifest.tools[2].description,
        requestBody:{required:true,content:{'application/json':{schema:changeInputSchema}}},
        responses:{
          '200':paidSuccess('Normalized readable content'),
          '400':{description:'Invalid input'},
          '402':paymentRequired,
          '502':{description:'Target fetch failed'}
        }
      }
    }
  }
};

for (const tool of dynamicTools) {
  openapi.paths[tool.route] = {
    post:{
      operationId:tool.route==='/web/markdown'
        ? 'convertUrlToMarkdown'
        : tool.name.replace(/[^a-zA-Z0-9]+(.)/g,(_,ch)=>ch.toUpperCase()),
      'x-payment-info':{
        protocols:['x402'],
        price:{mode:'fixed',currency:'USD',amount:String(tool.priceUsd)}
      },
      summary:tool.route==='/web/markdown' ? 'Convert URL to clean Markdown for RAG' : (tool.summary || tool.description),
      description:tool.route==='/web/markdown'
        ? 'Convert URL to clean Markdown for RAG. Convert a public webpage URL into clean agent-ready Markdown for grounding, research, summarization and LLM context.'
        : tool.description,
      requestBody:{required:true,content:{'application/json':{schema:tool.inputSchema}}},
      responses:{
        '200':tool.outputSchema
          ? paidSuccess('Utility result',{'application/json':{schema:tool.outputSchema}})
          : paidSuccess('Utility result'),
        '400':{description:'Invalid input'},
        '402':{description:'x402 payment required'}
      }
    }
  };
}

const agentCard = {
  name:'Industrial Platform Web Tools',
  description:manifest.description,
  url:ORIGIN,
  capabilities:manifest.tools.map(t=>({
    name:t.name,method:t.method,path:t.route,priceUsd:t.priceUsd,description:t.description
  })),
  payment:{protocol:'x402',network:NETWORK,networks:NETWORKS,asset:'USDC',priceUsd:0.001},
  openapi:ORIGIN+'/openapi.json',
  mcp:DIRECT_MCP,
  skill:ORIGIN+'/skill.md'
};

const true402ServiceManifest = {
  x402:'1.0',
  name:'industrial-platform-article-extractor',
  capabilities:['web','article','extract','text','rag','research','metadata'],
  pricing:{currency:'USDC',base:'0.002',unit:'request'},
  payment:{
    address:PAY_TO,
    chain:'base',
    facilitator:'https://api.cdp.coinbase.com/platform/v2/x402'
  },
  endpoint:ORIGIN+'/article'
};

const agentInstallManifest = {
  version:'1.3',
  schemaVersion:'1.0',
  origin:new URL(ORIGIN).host,
  display_name:manifest.name,
  name:manifest.name,
  description:manifest.description,
  payout_address:PAY_TO,
  payments:{
    x402:{
      networks:[
        {network:'base',asset:'USDC',contract:NETWORK_ASSETS['eip155:8453']}
      ]
    }
  },
  intents:manifest.tools.map(t=>({
    name:t.name,
    description:t.description,
    endpoint:t.route,
    method:t.method,
    price:{amount:t.priceUsd,currency:'USDC'}
  })),
  homepage:ORIGIN,
  openapi:ORIGIN+'/openapi.json',
  x402:ORIGIN+'/.well-known/x402',
  mcp:DIRECT_MCP,
  tools:manifest.tools.map(t=>({
    name:t.name,
    description:t.description,
    endpoint:ORIGIN+t.route,
    method:t.method,
    priceUsd:t.priceUsd,
    payment:{protocol:'x402',network:NETWORK,networks:NETWORKS,asset:'USDC'}
  }))
};

const skillMd = `---
name: industrial-platform-web-tools
description: Low-cost x402 checksums, encoding, crypto market data, document/web extraction, RAG utilities and deterministic page-change detection for autonomous agents.
---

# Industrial Platform Web Tools

## Metadata
POST ${ORIGIN}/metadata

Price: $0.001 USDC on Base.

Use for title/meta description, canonical URL, robots, Open Graph, Twitter cards, JSON-LD, headings, SEO, RAG ingestion, link previews and content QA.

Example:
\`\`\`json
{"urls":["https://example.com/"]}
\`\`\`

## URL to clean Markdown
POST ${ORIGIN}/web/markdown

Price: $0.001 USDC on Base.

Use when an agent needs to convert a public webpage URL to clean Markdown for RAG, grounding, research, summarization or LLM context.

Example:
\`\`\`json
{"url":"https://example.com/","max_chars":100000}
\`\`\`

## Change detection
POST ${ORIGIN}/change

Price: $0.001 USDC on Base.

Use for recurring monitoring of prices, inventory, availability, policies, documentation and competitor pages.

Example:
\`\`\`json
{"url":"https://example.com/","include_current_text":false}
\`\`\`

No buyer API key or account is required. Read the HTTP 402 payment requirements, sign the advertised x402 payment, and retry the request.
`;

const facilitator = createCdpFacilitatorClient();
const browserPaywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({appName:'Industrial Platform',testnet:false})
  .build();
const resourceServer = new x402ResourceServer(facilitator);
for (const network of NETWORKS) resourceServer.register(network, new ExactEvmScheme());
resourceServer
  .registerExtension(bazaarResourceServerExtension)
  .onAfterVerify(async (context) => {
    console.log('X402_VERIFY_RESULT', JSON.stringify({
      isValid: context.result?.isValid ?? null,
      invalidReason: context.result?.invalidReason ?? null,
      invalidMessage: context.result?.invalidMessage ?? null,
      network: context.requirements?.network ?? null,
      scheme: context.requirements?.scheme ?? null,
      amount: context.requirements?.amount ?? null,
      at: new Date().toISOString()
    }));
  })
  .onVerifyFailure(async (context) => {
    console.log('X402_VERIFY_FAILURE', JSON.stringify({
      error: String(context.error?.message || context.error || 'unknown'),
      network: context.requirements?.network ?? null,
      scheme: context.requirements?.scheme ?? null,
      amount: context.requirements?.amount ?? null,
      at: new Date().toISOString()
    }));
  })
  .onSettleFailure(async (context) => {
    console.log('X402_SETTLE_FAILURE', JSON.stringify({
      error: String(context.error?.message || context.error || 'unknown'),
      network: context.requirements?.network ?? null,
      scheme: context.requirements?.scheme ?? null,
      amount: context.requirements?.amount ?? null,
      phase: context.phase ?? null,
      at: new Date().toISOString()
    }));
  })
  .onAfterSettle(async (context) => {
    const payer=String(context.result?.payer || '').toLowerCase() || null;
    const amount=Number(context.requirements?.amount || 0);
    funnelState.settlements += 1;
    if (Number.isFinite(amount)) funnelState.settledAtomic += amount;
    if (payer) {
      funnelState.distinctPayers.add(payer);
      if (!INTERNAL_PAYER_ADDRESSES.has(payer)) funnelState.distinctExternalPayers.add(payer);
    }
    console.log('X402_SETTLED', JSON.stringify({
      payer,
      transaction: context.result?.transaction ?? null,
      amount: context.requirements?.amount ?? null,
      network: context.requirements?.network ?? null,
      payTo: context.requirements?.payTo ?? null,
      phase: context.phase ?? null,
      settledAt: new Date().toISOString()
    }));
  });

const routes = {
  'POST /metadata': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/metadata',
    description:manifest.tools[0].description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Web Tools',
    tags:['metadata','seo','structured-data','web','agents'],
    extensions:{...metadataDiscovery}
  },
  'POST /change': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/change',
    description:manifest.tools[1].description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Web Tools',
    tags:['monitoring','web-change','diff','web','agents'],
    extensions:{...changeDiscovery}
  },
  'POST /read': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/read',
    description:manifest.tools[2].description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Web Tools',
    tags:['web-reader','extract','read','rag','research','documents','agents'],
    extensions:{...changeDiscovery}
  }
};

for (const tool of dynamicTools) {
  routes[`POST ${tool.route}`] = {
    accepts:acceptsFor(tool.price),
    resource:ORIGIN+tool.route,
    description:tool.description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Agent Utility Market',
    tags:tool.tags,
    extensions:{...utilityDiscovery(tool)}
  };
}

const tryRoutes = {
  'GET /try/metadata': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/try/metadata',
    description:'Human browser test: extract metadata, OpenGraph and JSON-LD for one public URL.',
    mimeType:'application/json',
    serviceName:'Industrial Platform Browser Test'
  },
  'GET /try/change': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/try/change',
    description:'Human browser test: fetch a public URL and return its current deterministic content hash.',
    mimeType:'application/json',
    serviceName:'Industrial Platform Browser Test'
  },
  'GET /try/markdown': {
    accepts:acceptsFor(PRICE),
    resource:ORIGIN+'/try/markdown',
    description:'Human browser test: convert one public webpage URL to clean Markdown.',
    mimeType:'application/json',
    serviceName:'Industrial Platform Browser Test'
  }
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));

app.use((req,res,next)=>{
  const key=req.method.toUpperCase()+' '+req.path;
  if (Object.prototype.hasOwnProperty.call(routes,key)) {
    const hasPayment=Boolean(req.get('PAYMENT-SIGNATURE') || req.get('X-PAYMENT'));
    res.on('finish',()=>{
      const event={
        method:req.method,
        path:req.path,
        status:res.statusCode,
        hasPayment,
        priority:PRIORITY_ROUTE_SET.has(req.path),
        userAgent:req.get('user-agent')||null,
        at:new Date().toISOString()
      };
      const route=routeFunnel(req.path);
      if (hasPayment) {
        funnelState.paymentRetries += 1;
        route.paymentRetries += 1;
      }
      if (res.statusCode===402) {
        funnelState.challenges += 1;
        route.challenges += 1;
      }
      if (hasPayment && res.statusCode>=200 && res.statusCode<300) {
        funnelState.paidCompletions += 1;
        route.paidCompletions += 1;
      }
      console.log('X402_REQUEST_FLOW',JSON.stringify(event));
      if (res.statusCode===402) {
        console.log('X402_CHALLENGE',JSON.stringify({
          ...event,
          challenge:summarizePaymentRequiredHeader(res.getHeader('PAYMENT-REQUIRED'))
        }));
      }
    });
  }
  next();
});

app.get('/', (_req,res)=>res.json({
  name:manifest.name,
  description:manifest.description,
  payment:manifest.payment,
  capabilities:manifest.tools,
  discovery:{
    x402:'/.well-known/x402',
    openapi:'/openapi.json',
    agentCard:'/.well-known/agent-card.json',
    directMcp:DIRECT_MCP,
    pricing:'/pricing.json',
    skill:'/skill.md'
  }
}));

app.get('/try', (_req,res)=>res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Try Industrial Platform</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#111}
h1{font-size:32px;margin-bottom:8px}.sub{color:#555;margin-bottom:28px}
.card{border:1px solid #ddd;border-radius:14px;padding:20px;margin:16px 0}
label{display:block;font-weight:600;margin-bottom:8px}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #bbb;border-radius:9px;font-size:16px}
button{margin-top:12px;padding:11px 16px;border:0;border-radius:9px;background:#111;color:#fff;font-weight:700;cursor:pointer}
.small{font-size:13px;color:#666}.price{font-weight:700}
code{background:#f5f5f5;padding:2px 5px;border-radius:5px}
</style>
</head>
<body>
<h1>Try Industrial Platform</h1>
<p class="sub">Direct browser testing. No Perplexity, Grok, API key, or terminal required.</p>
<p>Each successful request costs <span class="price">$0.001 USDC on Base</span> and settles through x402 to <code>${PAY_TO}</code>.</p>
<div class="card">
<form method="GET" action="/try/metadata">
<label>Web Metadata</label>
<input name="url" type="url" required value="https://example.com/" placeholder="https://example.com/">
<button type="submit">Run metadata — $0.001</button>
</form>
</div>
<div class="card">
<form method="GET" action="/try/change">
<label>Page Change / Content Hash</label>
<input name="url" type="url" required value="https://example.com/" placeholder="https://example.com/">
<button type="submit">Run change check — $0.001</button>
</form>
</div>
<div class="card">
<form method="GET" action="/try/markdown">
<label>URL → Markdown</label>
<input name="url" type="url" required value="https://example.com/" placeholder="https://example.com/">
<button type="submit">Convert to Markdown — $0.001</button>
</form>
</div>
<p class="small">Your wallet signs the payment in your browser. Industrial Platform does not receive your private key.</p>
</body></html>`));

app.get('/health', (_req,res)=>res.json({ok:true,version:'2.2.0',payment:'coinbase-cdp',network:NETWORK,priorityRoutes:PRIORITY_ROUTES,browserTest:'/try'}));
app.get('/metrics/x402.json', (_req,res)=>res.json({
  startedAt:funnelState.startedAt,
  network:NETWORK,
  asset:'USDC',
  priorityRoutes:PRIORITY_ROUTES,
  challenges:funnelState.challenges,
  paymentRetries:funnelState.paymentRetries,
  paidCompletions:funnelState.paidCompletions,
  settlements:funnelState.settlements,
  settledAtomic:funnelState.settledAtomic,
  settledUsdc:funnelState.settledAtomic/1_000_000,
  distinctPayerCount:funnelState.distinctPayers.size,
  distinctExternalPayerCount:INTERNAL_PAYER_ADDRESSES.size ? funnelState.distinctExternalPayers.size : null,
  internalPayerExclusionConfigured:INTERNAL_PAYER_ADDRESSES.size>0,
  byRoute:funnelState.byRoute
}));

app.get('/metrics/x402-24h.json', async (_req,res)=>{
  const [settlements,routing] = await Promise.allSettled([
    readOnchainSettlementWindow(24),
    readAgent402Routing()
  ]);
  const onchain = settlements.status==='fulfilled'
    ? settlements.value
    : {error:String(settlements.reason?.message||settlements.reason)};
  const agent402 = routing.status==='fulfilled'
    ? routing.value
    : {error:String(routing.reason?.message||routing.reason)};
  res.json({
    generatedAt:new Date().toISOString(),
    volumeObjective:{
      paymentRetries:funnelState.paymentRetries,
      paidCompletions:funnelState.paidCompletions,
      distinctExternalPayerCount24h:Number.isFinite(onchain?.distinctExternalPayerCount) ? onchain.distinctExternalPayerCount : null,
      routerDispatchEligible:typeof agent402?.anyRouterDispatchEligible==='boolean' ? agent402.anyRouterDispatchEligible : null,
      targetDistinctExternalPayers:3,
      currentPayTo:PAY_TO
    },
    classification:{
      knownInternalPayers:[...INTERNAL_PAYER_ADDRESSES],
      externalDefinition:'Base USDC transfers to the current payout wallet using the observed x402 settlement method, excluding known internal/self payer addresses.',
      note:'External facilitated transfers are strong settlement evidence but are labeled separately from marketplace-reported payer counts.'
    },
    onchain,
    agent402
  });
});
app.get('/facilitator-health', async (_req,res)=>{
  try {
    const supported = await facilitator.getSupported();
    res.json({
      ok:true,
      extensions:supported.extensions,
      kinds:supported.kinds.map(k=>({x402Version:k.x402Version,scheme:k.scheme,network:k.network}))
    });
  } catch (error) {
    res.status(502).json({ok:false,error:String(error?.message||error)});
  }
});
app.get('/robots.txt', (_req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\n'));
app.get('/.well-known/x402', (_req,res)=>res.json(manifest));
app.get('/.well-known/x402.json', (_req,res)=>res.json(manifest));
app.get('/.well-known/x402-service.json', (_req,res)=>res.json(true402ServiceManifest));
app.get('/openapi.json', (_req,res)=>res.json(openapi));
app.get('/pricing.json', (_req,res)=>res.json({
  protocol:'x402',
  network:NETWORK,
  asset:{
    symbol:'USDC',
    address:NETWORK_ASSETS[NETWORK],
    decimals:6,
    atomicUnitUsd:0.000001
  },
  tools:manifest.tools.map(t=>({
    method:t.method,
    route:t.route,
    priceUsd:t.priceUsd,
    amountAtomic:String(Math.round(Number(t.priceUsd)*1_000_000))
  }))
}));
app.get('/.well-known/agent-card.json', (_req,res)=>res.json(agentCard));
app.get('/.well-known/agent.json', (_req,res)=>res.json(agentInstallManifest));
app.get('/llms.txt', (_req,res)=>res.type('text/plain').send([
  '# '+manifest.name,
  manifest.description,
  '',
  'Machine-readable discovery:',
  '- '+ORIGIN+'/.well-known/x402',
  '- '+ORIGIN+'/openapi.json',
  '- '+ORIGIN+'/.well-known/agent.json',
  '- '+ORIGIN+'/.well-known/agent-card.json',
  '- Direct x402 MCP: '+DIRECT_MCP,
  '',
  'Payment protocol: x402 v2',
  'Network: Base (eip155:8453)',
  'Asset: USDC (6 decimals; x402 amounts are atomic units, so amount "1" = $0.000001 USDC)',
  '',
  'Minimum payable route price: $0.001 USDC (1000 atomic units), matching the Coinbase CDP facilitator floor observed in production.',
  '',
  'Paid-call flow:',
  '1. Call the POST route normally.',
  '2. On HTTP 402, decode the PAYMENT-REQUIRED header.',
  '3. Create and sign an x402 payment with a caller-controlled wallet.',
  '4. Retry the same request with PAYMENT-SIGNATURE.',
  '5. Read PAYMENT-RESPONSE from the successful response.',
  '',
  'Recommended clients:',
  '- Python: x402_requests(...) or x402HttpxClient(...)',
  '- TypeScript: wrapFetchWithPayment(...) or wrapAxiosWithPayment(...)',
  '',
  'All paid routes use x402 USDC on Base. Current route prices are declared individually below.', 
  '',
  ...manifest.tools.map(t=>'- '+t.method+' '+ORIGIN+t.route+' - $'+t.priceUsd+' - '+t.description)
].join('\n')));
app.get(['/skill.md','/SKILL.md'], (_req,res)=>res.type('text/markdown').send(skillMd));

app.get('/metadata', (_req,res)=>res.json({
  method:'POST',priceUsd:0.001,network:NETWORK,description:manifest.tools[0].description,
  example:{urls:['https://example.com/']}
}));
app.get('/change', (_req,res)=>res.json({
  method:'POST',priceUsd:0.001,network:NETWORK,description:manifest.tools[1].description,
  example:{url:'https://example.com/',include_current_text:false}
}));
app.get('/read', (_req,res)=>res.json({
  method:'POST',priceUsd:0.001,network:NETWORK,description:manifest.tools[2].description,
  example:{url:'https://example.com/',include_current_text:true}
}));

for (const tool of dynamicTools) {
  app.get(tool.route, (_req,res)=>res.json({
    method:'POST',
    priceUsd:tool.priceUsd,
    network:NETWORK,
    description:tool.description,
    example:tool.example
  }));
}

app.use(paymentMiddleware(
  tryRoutes,
  resourceServer,
  {appName:'Industrial Platform',testnet:false},
  browserPaywall
));

app.get('/try/metadata', async (req,res)=>{
  try {
    const url=typeof req.query.url==='string' && req.query.url.trim() ? req.query.url.trim() : 'https://example.com/';
    res.json(await runMetadata({urls:[url]}));
  } catch (error) {
    const code=Number(error?.statusCode)||502;
    console.error('TRY_METADATA_ERROR', JSON.stringify({code,error:String(error?.message||error),payload:error?.payload||null,at:new Date().toISOString()}));
    res.status(code).json(error?.payload||{error:String(error?.message||error)});
  }
});

app.get('/try/change', async (req,res)=>{
  try {
    const url=typeof req.query.url==='string' && req.query.url.trim() ? req.query.url.trim() : 'https://example.com/';
    res.json(await runChange({url,include_current_text:false}));
  } catch (error) {
    const code=Number(error?.statusCode)||502;
    res.status(code).json({error:String(error?.message||error)});
  }
});

app.get('/try/markdown', async (req,res)=>{
  try {
    const url=typeof req.query.url==='string' && req.query.url.trim() ? req.query.url.trim() : 'https://example.com/';
    const tool=dynamicTools.find(t=>t.route==='/web/markdown');
    if(!tool) return res.status(500).json({error:'markdown tool unavailable'});
    res.json(await tool.run({url,max_chars:100000}));
  } catch (error) {
    const code=Number(error?.statusCode)||502;
    res.status(code).json({error:String(error?.message||error)});
  }
});

app.use(paymentMiddleware(routes, resourceServer));

app.post('/metadata', async (req,res)=>{
  try {
    const result = await runMetadata(req.body);
    res.json(result);
  } catch (error) {
    const code = Number(error?.statusCode)||502;
    res.status(code).json(error?.payload||{error:String(error?.message||error)});
  }
});

app.post('/change', async (req,res)=>{
  try {
    const result = await runChange(req.body);
    res.json(result);
  } catch (error) {
    const code = Number(error?.statusCode)||502;
    res.status(code).json({error:String(error?.message||error)});
  }
});

app.post('/read', async (req,res)=>{
  try {
    const result = await runChange({...req.body, include_current_text:true});
    res.json({
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
    });
  } catch (error) {
    const code = Number(error?.statusCode)||502;
    res.status(code).json({error:String(error?.message||error)});
  }
});

for (const tool of dynamicTools) {
  app.post(tool.route, async (req,res)=>{
    try {
      res.json(await tool.run(req.body));
    } catch (error) {
      const code=Number(error?.statusCode)||400;
      res.status(code).json({error:String(error?.message||error)});
    }
  });
}

app.use((_req,res)=>res.status(404).json({error:'not found'}));

app.listen(PORT,'0.0.0.0',()=>{
  console.log('Industrial Platform Coinbase x402 gateway listening on',PORT);
});
