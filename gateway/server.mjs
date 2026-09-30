import express from 'express';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';
import { runMetadata } from './metadata.mjs';
import { runChange } from './change.mjs';

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = 'https://x402-gateway-production-1f21.up.railway.app';
const PAY_TO = '0x0e66A3F909D3473E2517709e713B7afc0D767C42';
const PRICE = '$0.001';
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
  name:'Industrial Platform Web Tools',
  description:'Low-cost metadata extraction and deterministic webpage change detection for autonomous agents.',
  payment:{protocol:'x402',network:NETWORK,asset:'USDC',priceUsd:0.001,payTo:PAY_TO},
  tools:[
    {
      name:'web-metadata-intelligence',
      method:'POST',
      route:'/metadata',
      priceUsd:0.001,
      description:'Extract title, description, Open Graph, Twitter cards, canonical URL, robots directives, headings, JSON-LD and other page metadata.',
      inputSchema:metadataInputSchema
    },
    {
      name:'web-change-intelligence',
      method:'POST',
      route:'/change',
      priceUsd:0.001,
      description:'Detect meaningful webpage changes with deterministic hashes and diffs for prices, docs, policies, availability and competitor monitoring.',
      inputSchema:changeInputSchema
    }
  ]
};

const openapi = {
  openapi:'3.1.0',
  info:{
    title:'Industrial Platform Web Tools',
    version:'2.0.0',
    description:'Machine-payable metadata extraction and deterministic webpage change detection for autonomous agents.',
    contact:{
      name:'Industrial Platform',
      email:'art@naturalist.gallery',
      url:'https://github.com/industrial-platform-ai/industrial-platform-agent-tools'
    }
  },
  servers:[{url:ORIGIN}],
  paths:{
    '/metadata':{
      post:{
        operationId:'webMetadataIntelligence',
        summary:'Extract webpage metadata',
        description:manifest.tools[0].description,
        requestBody:{required:true,content:{'application/json':{schema:metadataInputSchema}}},
        responses:{
          '200':{description:'Metadata result'},
          '400':{description:'Invalid input'},
          '402':{description:'x402 payment required'},
          '502':{description:'Target fetch failed'}
        }
      }
    },
    '/change':{
      post:{
        operationId:'webChangeIntelligence',
        summary:'Detect webpage changes',
        description:manifest.tools[1].description,
        requestBody:{required:true,content:{'application/json':{schema:changeInputSchema}}},
        responses:{
          '200':{description:'Change comparison result'},
          '400':{description:'Invalid input'},
          '402':{description:'x402 payment required'},
          '502':{description:'Target fetch failed'}
        }
      }
    }
  }
};

const agentCard = {
  name:'Industrial Platform Web Tools',
  description:manifest.description,
  url:ORIGIN,
  capabilities:manifest.tools.map(t=>({
    name:t.name,method:t.method,path:t.route,priceUsd:t.priceUsd,description:t.description
  })),
  payment:{protocol:'x402',network:NETWORK,asset:'USDC',priceUsd:0.001},
  openapi:ORIGIN+'/openapi.json',
  skill:ORIGIN+'/skill.md'
};

const skillMd = `---
name: industrial-platform-web-tools
description: Low-cost x402 metadata extraction and deterministic page-change detection for autonomous agents.
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
const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

const routes = {
  'POST /metadata': {
    accepts:[{
      scheme:'exact',
      price:PRICE,
      network:NETWORK,
      payTo:PAY_TO,
      maxTimeoutSeconds:90
    }],
    resource:ORIGIN+'/metadata',
    description:manifest.tools[0].description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Web Tools',
    tags:['metadata','seo','structured-data','web','agents'],
    extensions:{...metadataDiscovery}
  },
  'POST /change': {
    accepts:[{
      scheme:'exact',
      price:PRICE,
      network:NETWORK,
      payTo:PAY_TO,
      maxTimeoutSeconds:90
    }],
    resource:ORIGIN+'/change',
    description:manifest.tools[1].description,
    mimeType:'application/json',
    serviceName:'Industrial Platform Web Tools',
    tags:['monitoring','web-change','diff','web','agents'],
    extensions:{...changeDiscovery}
  }
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));

app.get('/', (_req,res)=>res.json({
  name:manifest.name,
  description:manifest.description,
  payment:manifest.payment,
  capabilities:manifest.tools,
  discovery:{
    x402:'/.well-known/x402',
    openapi:'/openapi.json',
    agentCard:'/.well-known/agent-card.json',
    skill:'/skill.md'
  }
}));

app.get('/health', (_req,res)=>res.json({ok:true,version:'2.0.0',payment:'coinbase-cdp'}));
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
app.get('/openapi.json', (_req,res)=>res.json(openapi));
app.get('/.well-known/agent-card.json', (_req,res)=>res.json(agentCard));
app.get(['/skill.md','/SKILL.md'], (_req,res)=>res.type('text/markdown').send(skillMd));

app.get('/metadata', (_req,res)=>res.json({
  method:'POST',priceUsd:0.001,network:NETWORK,description:manifest.tools[0].description,
  example:{urls:['https://example.com/']}
}));
app.get('/change', (_req,res)=>res.json({
  method:'POST',priceUsd:0.001,network:NETWORK,description:manifest.tools[1].description,
  example:{url:'https://example.com/',include_current_text:false}
}));

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

app.use((_req,res)=>res.status(404).json({error:'not found'}));

app.listen(PORT,'0.0.0.0',()=>{
  console.log('Industrial Platform Coinbase x402 gateway listening on',PORT);
});
