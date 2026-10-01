import express from 'express';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';
import { runMetadata } from './metadata.mjs';
import { runChange } from './change.mjs';
import { utilityTools } from './utilities.mjs';
import { marketTools } from './market.mjs';
import { documentTools } from './article.mjs';
import { networkTools } from './network.mjs';
import { bundleTools } from './bundles.mjs';

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = 'https://x402-gateway-production-1f21.up.railway.app';
const PAY_TO = process.env.X402_PAY_TO || '0x1FfD0FE3D4E0e4bA6337231b9a81B6672aED9744';
const PRICE = '$0.001';
const NETWORK = 'eip155:8453';
const NETWORKS = ['eip155:8453','eip155:137','eip155:42161'];
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
const dynamicTools = [...utilityTools, ...marketTools, ...documentTools, ...networkTools, ...bundleTools];

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
  description:'Low-cost machine utilities, web metadata extraction and deterministic webpage change detection for autonomous agents.',
  payment:{protocol:'x402',network:NETWORK,networks:NETWORKS,asset:'USDC',priceUsd:0.001,payTo:PAY_TO},
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
    },
    {
      name:'web-reader',
      method:'POST',
      route:'/read',
      priceUsd:0.001,
      description:'Fetch a public HTTP or HTTPS URL and return normalized readable text from HTML, JSON, XML, CSV, JavaScript or plain-text responses for RAG, summarization and research.',
      inputSchema:changeInputSchema
    },
    ...dynamicTools.map(t=>({
      name:t.name,
      method:'POST',
      route:t.route,
      priceUsd:t.priceUsd,
      description:t.description,
      inputSchema:t.inputSchema
    }))
  ]
};

manifest.version = 1;
manifest.resources = manifest.tools.map(t=>ORIGIN+t.route);

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
        'x-payment-info':{
          protocols:['x402'],
          price:{mode:'fixed',currency:'USD',amount:String(manifest.tools[0].priceUsd)}
        },
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
        'x-payment-info':{
          protocols:['x402'],
          price:{mode:'fixed',currency:'USD',amount:String(manifest.tools[1].priceUsd)}
        },
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
          '200':{description:'Normalized readable content'},
          '400':{description:'Invalid input'},
          '402':{description:'x402 payment required'},
          '502':{description:'Target fetch failed'}
        }
      }
    }
  }
};

for (const tool of dynamicTools) {
  openapi.paths[tool.route] = {
    post:{
      operationId:tool.name.replace(/[^a-zA-Z0-9]+(.)/g,(_,ch)=>ch.toUpperCase()),
      'x-payment-info':{
        protocols:['x402'],
        price:{mode:'fixed',currency:'USD',amount:String(tool.priceUsd)}
      },
      summary:tool.description,
      description:tool.description,
      requestBody:{required:true,content:{'application/json':{schema:tool.inputSchema}}},
      responses:{
        '200':{description:'Utility result'},
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
        {network:'base',asset:'USDC',contract:NETWORK_ASSETS['eip155:8453']},
        {network:'polygon',asset:'USDC',contract:NETWORK_ASSETS['eip155:137']},
        {network:'arbitrum',asset:'USDC',contract:NETWORK_ASSETS['eip155:42161']}
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
description: Low-cost x402 metadata extraction and deterministic page-change detection for autonomous agents.
---

# Industrial Platform Web Tools

## Metadata
POST ${ORIGIN}/metadata

Price: $0.001 USDC on Base, Polygon, or Arbitrum.

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
const resourceServer = new x402ResourceServer(facilitator);
for (const network of NETWORKS) resourceServer.register(network, new ExactEvmScheme());
resourceServer
  .registerExtension(bazaarResourceServerExtension)
  .onAfterSettle(async (context) => {
    console.log('X402_SETTLED', JSON.stringify({
      payer: context.result?.payer ?? null,
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
app.get('/.well-known/x402.json', (_req,res)=>res.json(manifest));
app.get('/.well-known/x402-service.json', (_req,res)=>res.json(true402ServiceManifest));
app.get('/openapi.json', (_req,res)=>res.json(openapi));
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
  '',
  'All paid routes use x402 USDC on Base, Polygon, and Arbitrum. Utility routes are $0.0005; web metadata and change detection are $0.001.',
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
