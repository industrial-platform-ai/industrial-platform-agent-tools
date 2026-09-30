import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const STABLE_APIFY = 'https://stableapify.dev/api/actors/call';
const META_ACTOR = 'industrial_platform/web-metadata-intelligence';
const CHANGE_ACTOR = 'industrial_platform/web-change-intelligence';
const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 75_000;

const json = (res, code, body, headers={}) => {
  res.writeHead(code, {'content-type':'application/json; charset=utf-8', ...headers});
  res.end(JSON.stringify(body));
};

const manifest = {
  name: 'Industrial Platform Web Tools',
  description: 'Low-cost web metadata extraction and deterministic website change detection for autonomous agents.',
  tools: [
    {
      name: 'web-metadata-intelligence',
      route: '/metadata',
      method: 'POST',
      price: 0.01,
      example: { urls: ['https://example.com/'] },
      description: 'Extract title, description, Open Graph, Twitter cards, canonical URL, robots directives, headings, JSON-LD and other page metadata.',
      inputSchema: {
        type:'object',
        properties:{ urls:{type:'array',items:{type:'string'},minItems:1,maxItems:100} },
        required:['urls']
      }
    },
    {
      name: 'web-change-intelligence',
      route: '/change',
      method: 'POST',
      price: 0.01,
      example: { url: 'https://example.com/', include_current_text: false },
      description: 'Detect meaningful webpage changes with deterministic hashes and diffs for monitoring prices, docs, policies, availability and competitors.',
      inputSchema: {
        type:'object',
        properties:{
          url:{type:'string'},
          previous_hash:{type:'string'},
          previous_text:{type:'string'},
          include_current_text:{type:'boolean'}
        },
        required:['url']
      }
    }
  ]
};

const openapi = {
  openapi:'3.1.0',
  info:{
    title:'Industrial Platform Web Tools',
    version:'1.0.1',
    description:'Machine-payable web metadata extraction and deterministic webpage change detection for autonomous agents.',
    contact:{
      name:'Industrial Platform',
      email:'art@naturalist.gallery',
      url:'https://github.com/industrial-platform-ai/industrial-platform-agent-tools'
    }
  },
  servers:[{url:'https://x402-gateway-production-1f21.up.railway.app'}],
  paths:{
    '/metadata':{
      post:{
        operationId:'webMetadataIntelligence',
        summary:'Extract webpage metadata',
        description:manifest.tools[0].description,
        requestBody:{required:true,content:{'application/json':{schema:manifest.tools[0].inputSchema}}},
        responses:{'200':{description:'Metadata result'},'402':{description:'x402 payment required'}}
      }
    },
    '/change':{
      post:{
        operationId:'webChangeIntelligence',
        summary:'Detect webpage changes',
        description:manifest.tools[1].description,
        requestBody:{required:true,content:{'application/json':{schema:manifest.tools[1].inputSchema}}},
        responses:{'200':{description:'Change comparison result'},'402':{description:'x402 payment required'}}
      }
    }
  }
};


const skillMd = `---
name: industrial-platform-web-tools
description: Paid x402 web metadata extraction and deterministic page-change detection for autonomous agents.
---

# Industrial Platform Web Tools

Use these tools when an agent needs structured facts from a public webpage or needs to determine whether a public page changed.

## Metadata

POST https://x402-gateway-production-1f21.up.railway.app/metadata

Choose this route for:
- title and meta description
- canonical URL and robots directives
- Open Graph and Twitter card metadata
- JSON-LD / structured data
- headings and page metadata for SEO, RAG ingestion, link previews, and content QA

Input:
\`\`\`json
{"urls":["https://example.com/"]}
\`\`\`

## Change detection

POST https://x402-gateway-production-1f21.up.railway.app/change

Choose this route for:
- scheduled website monitoring
- pricing, inventory, availability, policy, documentation, and competitor changes
- deterministic hashes and text diffs

Input:
\`\`\`json
{"url":"https://example.com/","include_current_text":false}
\`\`\`

Both routes use HTTP 402 machine payments in USDC on Base. No API key or account is required by the buyer. Inspect the 402 PAYMENT-REQUIRED header, sign the advertised payment, and retry the same request.
`;

const agentCard = {
  name: 'Industrial Platform Web Tools',
  description: manifest.description,
  url: 'https://x402-gateway-production-1f21.up.railway.app',
  capabilities: [
    { name: 'web-metadata-intelligence', method: 'POST', path: '/metadata', priceUsd: 0.01 },
    { name: 'web-change-intelligence', method: 'POST', path: '/change', priceUsd: 0.01 }
  ],
  payment: { protocol: 'x402', network: 'eip155:8453', asset: 'USDC' },
  openapi: 'https://x402-gateway-production-1f21.up.railway.app/openapi.json',
  skill: 'https://x402-gateway-production-1f21.up.railway.app/skill.md'
};

async function bodyBuffer(req) {
  const chunks=[];
  let total=0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function rewritePaymentRequired(encoded, req, tool) {
  if (!encoded) return encoded;
  try {
    const envelope = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const origin = 'https://' + req.headers.host;
    envelope.resource = {
      ...(envelope.resource || {}),
      url: origin + tool.route,
      method: 'POST',
      description: tool.description,
      mimeType: 'application/json',
      tags: ['Industrial Platform', tool.name],
      serviceName: 'Industrial Platform Web Tools',
      tags: tool.route === '/metadata'
        ? ['metadata','seo','structured-data','web','agents']
        : ['monitoring','web-change','diff','web','agents']
    };
    envelope.extensions = envelope.extensions || {};
    const outputExample = tool.route === '/metadata'
      ? { results: [{ url: 'https://example.com/', title: 'Example Domain' }] }
      : { url: 'https://example.com/', changed: false, current_hash: 'example' };

    envelope.extensions.bazaar = {
      info: {
        input: {
          type: 'http',
          method: 'POST',
          bodyType: 'json',
          body: tool.example || {}
        },
        output: {
          type: 'json',
          example: outputExample
        }
      },
      schema: {
        type: 'object',
        required: ['input'],
        properties: {
          input: {
            type: 'object',
            required: ['type', 'method', 'bodyType', 'body'],
            additionalProperties: false,
            properties: {
              type: { const: 'http', type: 'string' },
              method: { enum: ['POST'], type: 'string' },
              bodyType: { enum: ['json'], type: 'string' },
              body: tool.inputSchema
            }
          },
          output: {
            type: 'object',
            required: ['type', 'example'],
            additionalProperties: false,
            properties: {
              type: { const: 'json', type: 'string' },
              example: { type: 'object' }
            }
          }
        }
      }
    };
    return Buffer.from(JSON.stringify(envelope)).toString('base64');
  } catch {
    return encoded;
  }
}

async function proxy(req,res,actorId,tool,inputOverride=null) {
  let input;
  if (inputOverride !== null) {
    input = inputOverride;
  } else {
    const raw = await bodyBuffer(req);
    try {
      input = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      return json(res,400,{error:'invalid_json'});
    }
  }

  const headers = {'content-type': 'application/json'};
  for (const h of ['payment-signature','x-payment','skyfire-pay-id']) {
    if (req.headers[h]) headers[h]=req.headers[h];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(STABLE_APIFY,{
      method:'POST',
      headers,
      body:JSON.stringify({actorId,input}),
      redirect:'manual',
      signal:controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const passthrough={};
  for (const [k,v] of upstream.headers) {
    if (/^(payment-required|x-payment-response|content-type|www-authenticate)$/i.test(k)) {
      passthrough[k] = k.toLowerCase() === 'payment-required'
        ? rewritePaymentRequired(v, req, tool)
        : v;
    }
  }
  res.writeHead(upstream.status,passthrough);
  if (upstream.body) {
    for await (const chunk of upstream.body) res.write(chunk);
  }
  res.end();
}

const server = http.createServer(async (req,res)=>{
  try {
    const u = new URL(req.url,'http://localhost');
    if (req.method==='GET' && u.pathname==='/health') return json(res,200,{ok:true});
    if (req.method==='GET' && u.pathname==='/.well-known/x402') return json(res,200,manifest);
    if (req.method==='GET' && u.pathname==='/openapi.json') return json(res,200,openapi);
    if (req.method==='GET' && (u.pathname==='/skill.md' || u.pathname==='/SKILL.md')) {
      res.writeHead(200, {'content-type':'text/markdown; charset=utf-8'});
      return res.end(skillMd);
    }
    if (req.method==='GET' && u.pathname==='/.well-known/agent-card.json') return json(res,200,agentCard);
    if (req.method==='GET' && u.pathname==='/metadata') return await proxy(req,res,META_ACTOR,manifest.tools[0],manifest.tools[0].example);
    if (req.method==='GET' && u.pathname==='/change') return await proxy(req,res,CHANGE_ACTOR,manifest.tools[1],manifest.tools[1].example);
    if (req.method==='POST' && u.pathname==='/metadata') return await proxy(req,res,META_ACTOR,manifest.tools[0]);
    if (req.method==='POST' && u.pathname==='/change') return await proxy(req,res,CHANGE_ACTOR,manifest.tools[1]);
    return json(res,404,{error:'not found'});
  } catch (e) {
    const status = Number(e?.statusCode) || (e?.name === 'AbortError' ? 504 : 502);
    return json(res,status,{error:'gateway_error',message:String(e?.message||e)});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log('Industrial Platform x402 gateway listening on',PORT));
