import http from 'node:http';
import { createHash } from 'node:crypto';
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { createSIWxClientExtension } from '@x402/extensions/sign-in-with-x';
import { privateKeyToAccount } from 'viem/accounts';
import { submitFreeDirectoryListing } from './free-directory.mjs';
import { registerOpenTaskAutonomousAgent } from './opentask.mjs';
import { verifyVet402PayeeNoSpend, submitX402ListNoSpend } from './no-spend-bootstrap.mjs';

const PORT = Number(process.env.PORT || 3000);
const TARGET = process.env.X402_TARGET || 'https://x402-gateway-production-1f21.up.railway.app/metadata';
const key = process.env.EVM_PRIVATE_KEY;
const runPayment = process.env.RUN_PAYMENT === '1';
const runRegistry = process.env.RUN_X402SCAN_REGISTRATION === '1';
const registryTarget = process.env.X402SCAN_REGISTRY_TARGET || 'https://x402scan.com/api/x402/registry/register-origin';
const sellerOrigin = process.env.SELLER_ORIGIN || 'https://x402-gateway-production-1f21.up.railway.app';
const agent402IndexTarget = 'https://agent402.tools/api/index/register';
const expectedAgent402ToolCount = 43;
const agent402FindTarget = 'https://agent402.tools/api/find';
const agent402WishesTarget = 'https://agent402.tools/api/wishes?limit=50&qualifiedOnly=true&sort=count';
const agent402SellerIndexTarget = 'https://agent402.tools/api/index?seller=' + encodeURIComponent(new URL(sellerOrigin || 'https://x402-gateway-production-1f21.up.railway.app').host);
const basedAgentsTasksTarget = 'https://api.basedagents.ai/v1/tasks?status=open&limit=100';
const agentExchangeTasksTarget = 'https://exchange.agentexchange.work/tasks';
const agentExchangeRegisterTarget = 'https://exchange.agentexchange.work/agents/register';
const x402ArenaRegisterTarget = 'https://core.x402arena.gg/register';
const taskBountyOpenTasksTarget = 'https://www.task-bounty.com/api/v1/tasks?state=open&limit=50';
const externalRouteQueries = [
  'URL to clean agent-ready Markdown web reading RAG content extraction',
  'SEC EDGAR recent filings ticker CIK 10-K 10-Q 8-K',
  'SEC XBRL company financial facts revenue assets liabilities',
  'Coinbase crypto market snapshot bid ask OHLCV recent trades',
  'public webpage dossier metadata article security headers robots RAG chunks',
  'extract clean article text from a public webpage',
  'webpage metadata Open Graph JSON-LD canonical URL',
  'validate json schema agent payload',
  'convert html to markdown for llm rag',
  'extract emails urls entities from text',
  'check http status url latency redirects',
  'parse rss atom feed to json',
  'extract sitemap xml urls',
  'extract links from webpage url',
  'repair malformed json llm output'
];
const marketQueries = [
  'cryptographic hash sha256 sha512 text',
  'hmac signature',
  'base64 encode text',
  'base64 decode text',
  'jwt decode token',
  'hex encode decode',
  'checksum sha256 sha512',
  'canonicalize json',
  'parse query string',
  'inspect url',
  'text statistics word count',
  'compare text diff',
  'convert html to text',
  'extract links from html',
  'extract metadata from html',
  'slugify text',
  'extract webpage metadata',
  'read webpage text for RAG',
  'detect webpage changes',
  'crypto price BTC',
  'crypto 24h stats volume high low',
  'crypto order book best bid ask',
  'crypto historical candles OHLCV',
  'crypto recent trades order flow',
  'extract article clean text',
  'dns lookup MX TXT',
  'http security headers status',
  'robots.txt crawl allowed path',
  'crypto market snapshot dashboard',
  'web intelligence dossier RAG research',
  'validate json schema agent payload',
  'convert html to markdown for llm rag',
  'extract emails urls entities from text',
  'check http status url latency redirects',
  'parse rss atom feed to json'
];
const requestMethod = (process.env.X402_METHOD || 'POST').toUpperCase();
const requestBodyOverride = process.env.X402_REQUEST_BODY || '';

function deriveSellerAccount() {
  if (!key) throw new Error('EVM_PRIVATE_KEY missing');
  const raw = Buffer.from(key.replace(/^0x/, ''), 'hex');
  const derived = createHash('sha256').update(raw).update('industrial-platform-x402-seller-v1').digest('hex');
  return privateKeyToAccount('0x' + derived);
}

const sellerAccount = key ? deriveSellerAccount() : null;

let state = {
  startedAt: new Date().toISOString(),
  enabled: runPayment || runRegistry,
  mode: runRegistry ? 'x402scan-registration' : (runPayment ? 'payment' : 'idle'),
  target: TARGET,
  status: runPayment ? 'pending' : 'armed',
  result: null,
  error: null,
  sellerAddress: sellerAccount?.address ?? null,
};

function makeClient() {
  if (!key) throw new Error('EVM_PRIVATE_KEY missing');
  const signer = privateKeyToAccount(key);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  client.registerExtension(createSIWxClientExtension({ signers: [signer] }));
  const httpClient = new x402HTTPClient(client);
  return { signer, fetch: wrapFetchWithPayment(globalThis.fetch, httpClient) };
}

async function payOnce() {
  const { fetch: paidFetch } = makeClient();

  state.status = 'paying';
  let requestBody;
  if (requestBodyOverride) {
    try {
      requestBody = JSON.parse(requestBodyOverride);
    } catch (error) {
      throw new Error('X402_REQUEST_BODY must be valid JSON: ' + String(error?.message || error));
    }
  } else {
    requestBody = TARGET.endsWith('/change')
      ? { url: 'https://example.com/', include_current_text: false }
      : { urls: ['https://example.com/'] };
  }

  const requestInit = {
    method: requestMethod,
    headers: { 'content-type': 'application/json' },
  };
  if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
    requestInit.body = JSON.stringify(requestBody);
  }

  const response = await paidFetch(TARGET, requestInit);

  const text = await response.text();
  state.result = {
    httpStatus: response.status,
    ok: response.ok,
    paymentResponse:
      response.headers.get('payment-response') ||
      response.headers.get('x-payment-response') ||
      null,
    paymentRequired:
      response.headers.get('payment-required') ||
      response.headers.get('x-payment-required') ||
      null,
    extensionResponses:
      response.headers.get('extension-responses') ||
      response.headers.get('x-extension-responses') ||
      null,
    body: text.slice(0, 20000),
    completedAt: new Date().toISOString(),
  };
  state.status = response.ok ? 'paid' : 'failed';
  console.log('x402 payment result:', JSON.stringify(state.result));
  if (!response.ok) throw new Error('Paid request returned HTTP ' + response.status);
}


async function registerX402scanAuthenticatedNoSpend() {
  if (!sellerAccount) throw new Error('Seller account unavailable');
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: sellerAccount });
  client.registerExtension(createSIWxClientExtension({ signers: [sellerAccount] }));
  const httpClient = new x402HTTPClient(client);
  const authFetch = wrapFetchWithPayment(globalThis.fetch, httpClient);
  const target = 'https://www.x402scan.com/api/x402/registry/register-origin';
  const response = await authFetch(target, {
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({origin:sellerOrigin})
  });
  const body = await response.text();
  console.log('x402scan SIWX registration:', JSON.stringify({
    httpStatus:response.status,
    ok:response.ok,
    wallet:sellerAccount.address,
    body:body.slice(0,5000),
    completedAt:new Date().toISOString()
  }));
}

async function registerX402scanFree() {
  const target = 'https://www.x402scan.com/api/x402/registry/register-origin';
  try {
    const response = await fetch(target, {
      method:'POST',
      redirect:'manual',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({origin:sellerOrigin})
    });
    const body = await response.text();
    console.log('x402scan free registration:', JSON.stringify({
      httpStatus:response.status,
      ok:response.ok,
      location:response.headers.get('location'),
      body:body.slice(0,5000),
      completedAt:new Date().toISOString()
    }));
    if(response.status===402){
      let challenge=null;
      try{challenge=JSON.parse(body);}catch{}
      const accepts=challenge?.accepts;
      const siwx=challenge?.extensions?.['sign-in-with-x'];
      if(Array.isArray(accepts) && accepts.length===0 && siwx){
        await registerX402scanAuthenticatedNoSpend();
      } else {
        console.log('x402scan auth not attempted because challenge may require payment');
      }
    }
  } catch (error) {
    console.error('x402scan free registration failed:', String(error?.stack||error));
  }
}

async function registerTrue402Free() {
  try {
    const result = await submitFreeDirectoryListing(sellerOrigin);
    console.log('true402 free registration:', JSON.stringify(result));
  } catch (error) {
    console.error('true402 free registration failed:', String(error?.stack || error));
  }
}

async function fetchNoSpendOpportunity(label, url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
        'user-agent': 'IndustrialPlatform-EarningScout/1.0'
      },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.text();
    console.log('External earning diagnostic:', JSON.stringify({
      label,
      url,
      httpStatus: response.status,
      ok: response.ok,
      body: body.slice(0, 30000),
      completedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.error('External earning diagnostic failed:', label, String(error?.message || error));
  }
}

async function registerX402ArenaNoSpend() {
  if (!sellerAccount) return;
  const listings = [
    {
      name:'industrial-platform-markdown',
      endpoint:sellerOrigin + '/web/markdown',
      description:'Convert a public URL into clean LLM-ready Markdown for web reading and RAG.',
      niche:'intelligence',
      method:'POST',
      inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},max_chars:{type:'integer'}},required:['url']},
      outputSchema:{type:'object',properties:{markdown:{type:'string'},title:{type:'string'},final_url:{type:'string'}}}
    },
    {
      name:'industrial-platform-metadata',
      endpoint:sellerOrigin + '/metadata',
      description:'Extract title, canonical URL, Open Graph, JSON-LD and page metadata from public URLs.',
      niche:'developer-tools',
      method:'POST',
      inputSchema:{type:'object',properties:{urls:{type:'array',items:{type:'string',format:'uri'}}},required:['urls']},
      outputSchema:{type:'object',properties:{summary:{type:'object'},results:{type:'array'}}}
    },
    {
      name:'industrial-platform-change',
      endpoint:sellerOrigin + '/change',
      description:'Detect meaningful webpage changes with deterministic hashes and text diffs.',
      niche:'developer-tools',
      method:'POST',
      inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},previous_hash:{type:'string'}},required:['url']},
      outputSchema:{type:'object',properties:{status:{type:'string'},current_hash:{type:'string'},changed:{type:'boolean'}}}
    },
    {
      name:'industrial-platform-crypto-snapshot',
      endpoint:sellerOrigin + '/crypto/snapshot',
      description:'Coinbase public crypto market snapshot with ticker, book, 24h stats, candles and trades.',
      niche:'crypto-finance',
      method:'POST',
      inputSchema:{type:'object',properties:{product_id:{type:'string'}},required:['product_id']},
      outputSchema:{type:'object',properties:{status:{type:'string'},product_id:{type:'string'}}}
    }
  ];
  for (const listing of listings) {
    try {
      const payload={...listing,walletAddress:sellerAccount.address,resourceType:'http'};
      const response=await fetch(x402ArenaRegisterTarget,{
        method:'POST',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(20000)
      });
      const body=await response.text();
      console.log('x402 Arena registration:', JSON.stringify({
        name:listing.name,httpStatus:response.status,ok:response.ok,
        body:body.slice(0,8000),completedAt:new Date().toISOString()
      }));
      if(response.status===402) {
        console.log('x402 Arena registration payment challenge ignored; no-spend policy preserved.');
      }
    } catch(error) {
      console.error('x402 Arena registration failed:', listing.name, String(error?.message||error));
    }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
}

async function registerAgentExchangePassport() {
  try {
    const wallet = sellerAccount?.address || account?.address || null;
    const payload = {
      id: 'industrial-platform-x402',
      name: 'Industrial Platform x402 Tools',
      skills: ['x402','web','url-to-markdown','metadata','change-detection','rag','crypto-market-data','dns','sec-data'],
      wallet,
      endpoint: sellerOrigin
    };
    const response = await fetch(agentExchangeRegisterTarget, {
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(20000)
    });
    const body=await response.text();
    console.log('AgentExchange passport registration:', JSON.stringify({
      httpStatus:response.status,ok:response.ok,
      body:body.slice(0,8000),completedAt:new Date().toISOString()
    }));
  } catch(error) {
    console.error('AgentExchange passport registration failed:', String(error?.message||error));
  }
}

async function runExternalEarningDiagnostics() {
  await fetchNoSpendOpportunity('agent402-seller-index', agent402SellerIndexTarget);
  for (const q of externalRouteQueries) {
    const url = 'https://agent402.tools/api/route?include=external&q=' + encodeURIComponent(q);
    await fetchNoSpendOpportunity('agent402-external-route:' + q, url);
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  await fetchNoSpendOpportunity('basedagents-open-tasks', basedAgentsTasksTarget);
  await fetchNoSpendOpportunity('agentexchange-open-tasks', agentExchangeTasksTarget);
  await fetchNoSpendOpportunity('taskbounty-open-tasks', taskBountyOpenTasksTarget);
}

async function fetchAgent402Wishes() {
  try {
    const response = await fetch(agent402WishesTarget, { headers: { accept: 'application/json' } });
    const body = await response.text();
    console.log('Agent402 wishes feed:', JSON.stringify({
      httpStatus:response.status,
      ok:response.ok,
      body:body.slice(0,20000),
      completedAt:new Date().toISOString()
    }));
  } catch (error) {
    console.error('Agent402 wishes feed failed:', String(error?.message || error));
  }
}

async function runExternalRouteDiagnostics() {
  const queries = [
    'cryptographic hash sha256 sha512 text',
    'base64 encode text',
    'extract article clean text',
    'read webpage text for RAG',
    'crypto price BTC',
    'crypto 24h stats volume high low',
    'dns lookup MX TXT',
    'http security headers status',
    'robots.txt crawl allowed path',
    'crypto market snapshot dashboard',
    'web intelligence dossier RAG research',
    'validate json schema agent payload',
    'convert html to markdown for llm rag',
    'extract emails urls entities from text',
    'check http status url latency redirects',
    'parse rss atom feed to json',
    'extract sitemap xml urls',
    'extract links from webpage url',
    'repair malformed json llm output'
  ];
  for (const q of queries) {
    try {
      const url = 'https://agent402.tools/api/route?q=' + encodeURIComponent(q) + '&include=external';
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      const body = await response.text();
      console.log('Agent402 external route diagnostic:', JSON.stringify({
        q,
        httpStatus:response.status,
        ok:response.ok,
        body:body.slice(0,12000),
        completedAt:new Date().toISOString()
      }));
      await new Promise(resolve => setTimeout(resolve, 2300));
    } catch (error) {
      console.error('Agent402 external route diagnostic failed:', q, String(error?.message || error));
    }
  }
}

async function runFindDiagnostics() {
  for (const q of marketQueries) {
    try {
      const url = agent402FindTarget + '?q=' + encodeURIComponent(q);
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      const body = await response.text();
      console.log('Agent402 find diagnostic:', JSON.stringify({
        q,
        httpStatus: response.status,
        ok: response.ok,
        body: body.slice(0, 6000),
        completedAt: new Date().toISOString(),
      }));
      await new Promise(resolve => setTimeout(resolve, 2200));
    } catch (error) {
      console.error('Agent402 find diagnostic failed:', q, String(error?.message || error));
    }
  }
}

async function registerAgent402OriginOnce({scheduleRetry=true}={}) {
  const response = await fetch(agent402IndexTarget, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin: sellerOrigin }),
  });
  const body = await response.text();
  console.log('Agent402 index registration:', JSON.stringify({
    httpStatus: response.status,
    ok: response.ok,
    origin: sellerOrigin,
    body: body.slice(0, 4000),
    completedAt: new Date().toISOString(),
  }));

  let parsed = null;
  try { parsed = JSON.parse(body); } catch {}
  const rereadSeconds = Number(parsed?.reverify?.nextRereadInSeconds);
  const toolCount = Number(parsed?.seller?.toolCount);

  if (response.ok && Number.isFinite(toolCount) && toolCount >= expectedAgent402ToolCount) {
    await runExternalRouteDiagnostics();
    await runFindDiagnostics();
    return;
  }

  if (response.ok && scheduleRetry && Number.isFinite(rereadSeconds) && rereadSeconds > 0 && rereadSeconds <= 3600) {
    const delayMs = (rereadSeconds + 5) * 1000;
    console.log('Agent402 re-index retry scheduled in', Math.round(delayMs / 1000), 'seconds');
    setTimeout(() => {
      registerAgent402OriginOnce({scheduleRetry:false}).then(async()=>{ await runExternalRouteDiagnostics(); await runFindDiagnostics(); }).catch((error) => {
        console.error('Agent402 scheduled re-index failed:', String(error?.stack || error));
      });
    }, delayMs);
  } else if (response.ok) {
    await runFindDiagnostics();
  }
}

async function registerX402scanOnce() {
  const { signer, fetch: authFetch } = makeClient();
  state.status = 'registering';
  const response = await authFetch(registryTarget, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin: sellerOrigin }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  state.result = {
    httpStatus: response.status,
    ok: response.ok,
    wallet: signer.address,
    registryTarget,
    sellerOrigin,
    body: parsed ?? text.slice(0, 20000),
    completedAt: new Date().toISOString(),
  };
  state.status = response.ok ? 'registered' : 'failed';
  console.log('x402scan registration result:', JSON.stringify(state.result));
  if (!response.ok) throw new Error('x402scan registration returned HTTP ' + response.status + ': ' + text.slice(0, 4000));
}

registerTrue402Free();
verifyVet402PayeeNoSpend({ sellerAccount, sellerOrigin }).catch(error => console.error('vet402 payee verification failed:', String(error?.message || error)));
submitX402ListNoSpend({ sellerOrigin }).catch(error => console.error('x402 List submission failed:', String(error?.message || error)));
fetchAgent402Wishes();
runExternalEarningDiagnostics();
registerAgentExchangePassport();
registerX402ArenaNoSpend();
registerOpenTaskAutonomousAgent().catch(error => console.error('OpenTask autonomous registration failed:', String(error?.message || error)));
registerX402scanFree();
registerAgent402OriginOnce().catch((error) => {
  console.error('Agent402 index registration failed:', String(error?.stack || error));
});

if (runRegistry) {
  registerX402scanOnce().catch((error) => {
    state.status = 'failed';
    state.error = String(error?.stack || error);
    console.error(state.error);
  });
} else if (runPayment) {
  payOnce().catch((error) => {
    state.status = 'failed';
    state.error = String(error?.stack || error);
    console.error(state.error);
  });
}

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, status: state.status }));
  }
  if (req.url === '/seller-address') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ address: sellerAccount?.address ?? null }));
  }
  if (req.url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(state));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}).listen(PORT, '0.0.0.0', () => {
  console.log('x402 seed buyer listening on', PORT, 'payment state:', state.status, 'seller address:', sellerAccount?.address ?? null);
});
