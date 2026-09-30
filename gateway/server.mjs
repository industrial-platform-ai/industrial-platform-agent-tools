import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const META = 'https://api.apify.com/v2/actors/industrial_platform~web-metadata-intelligence/run-sync-get-dataset-items?maxTotalChargeUsd=0.01';
const CHANGE = 'https://api.apify.com/v2/actors/industrial_platform~web-change-intelligence/run-sync-get-dataset-items?maxTotalChargeUsd=0.01';

const json = (res, code, body, headers={}) => {
  res.writeHead(code, {'content-type':'application/json; charset=utf-8', ...headers});
  res.end(JSON.stringify(body));
};

const manifest = {
  name: 'Industrial Platform Fast Web Tools',
  description: 'Low-cost web metadata extraction and deterministic website change detection for autonomous agents.',
  tools: [
    {
      name: 'web-metadata-intelligence',
      route: '/metadata',
      method: 'POST',
      price: '$0.001 per successful URL',
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
      price: '$0.001 per successful comparison',
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
  info:{title:'Industrial Platform Fast Web Tools',version:'1.0.0'},
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

async function bodyBuffer(req) {
  const chunks=[];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function proxy(req,res,target) {
  const body = await bodyBuffer(req);
  const headers = {'content-type': req.headers['content-type'] || 'application/json'};
  for (const h of ['payment-signature','x-payment','authorization']) {
    if (req.headers[h]) headers[h]=req.headers[h];
  }
  const upstream = await fetch(target,{method:'POST',headers,body,redirect:'manual'});
  const passthrough={};
  for (const [k,v] of upstream.headers) {
    if (/^(payment-required|x-payment-response|content-type|www-authenticate)$/i.test(k)) passthrough[k]=v;
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
    if (req.method==='POST' && u.pathname==='/metadata') return await proxy(req,res,META);
    if (req.method==='POST' && u.pathname==='/change') return await proxy(req,res,CHANGE);
    return json(res,404,{error:'not found'});
  } catch (e) {
    return json(res,502,{error:'gateway_error',message:String(e?.message||e)});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log('Industrial Platform x402 gateway listening on',PORT));
