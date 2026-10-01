import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createPaymentWrapper, x402ResourceServer } from '@x402/mcp';
import { ExactEvmScheme } from '@x402/evm/exact/server';
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

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.MCP_PUBLIC_ORIGIN || 'https://x402-mcp-gateway-production.up.railway.app';
const PAY_TO = process.env.X402_PAY_TO || '0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E';
const NETWORK = 'eip155:8453';

const metadataInputSchema = {
  type:'object',
  properties:{
    urls:{type:'array',items:{type:'string',format:'uri'},minItems:1,maxItems:100},
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

const dynamicTools = [...utilityTools, ...marketTools, ...documentTools, ...networkTools, ...bundleTools, ...agenticTools];

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

const tools = [
  {
    name:'web-change-intelligence',
    route:'/change',
    priceUsd:0.001,
    description:'Detect whether a public webpage changed by comparing current content against a previous hash or previous text; returns deterministic hashes and diffs for monitoring.',
    inputSchema:changeInputSchema,
    example:{url:'https://example.com/',include_current_text:false},
    run:runChange
  },
  ...(markdownTool ? [{
    name:markdownTool.name,
    route:markdownTool.route,
    priceUsd:markdownTool.priceUsd,
    price:markdownTool.price,
    description:markdownTool.description,
    inputSchema:markdownTool.inputSchema,
    example:markdownTool.example,
    run:markdownTool.run
  }] : []),
  {
    name:'web-metadata-intelligence',
    route:'/metadata',
    priceUsd:0.001,
    description:'Extract webpage metadata, Open Graph, canonical URL, robots directives, headings and JSON-LD from public URLs for SEO, link previews, structured-data reads and RAG ingestion.',
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
  }))
];

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
resourceServer.register(NETWORK, new ExactEvmScheme());
await resourceServer.initialize();

const acceptsByTool = new Map();
for (const tool of tools) {
  acceptsByTool.set(tool.name, await resourceServer.buildPaymentRequirements({
    scheme:'exact',
    network:NETWORK,
    payTo:PAY_TO,
    price:tool.price || ('$'+Number(tool.priceUsd).toFixed(6).replace(/0+$/,'').replace(/\.$/,''))
  }));
}

function createServer() {
  const server = new McpServer({
    name:'industrial-platform-direct-x402',
    version:'1.0.0'
  });

  for (const tool of tools) {
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
      schemaToZod(tool.inputSchema),
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
  catalog:'https://x402-gateway-production-1f21.up.railway.app/.well-known/x402'
}));

app.get('/health', (_req,res)=>res.json({ok:true,toolCount:tools.length,network:NETWORK}));

app.all('/mcp', async (req,res)=>{
  const server = createServer();
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
