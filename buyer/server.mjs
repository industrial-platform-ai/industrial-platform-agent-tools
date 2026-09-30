import http from 'node:http';
import { createHash } from 'node:crypto';
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { createSIWxClientExtension } from '@x402/extensions/sign-in-with-x';
import { privateKeyToAccount } from 'viem/accounts';

const PORT = Number(process.env.PORT || 3000);
const TARGET = process.env.X402_TARGET || 'https://x402-gateway-production-1f21.up.railway.app/metadata';
const key = process.env.EVM_PRIVATE_KEY;
const runPayment = process.env.RUN_PAYMENT === '1';
const runRegistry = process.env.RUN_X402SCAN_REGISTRATION === '1';
const registryTarget = process.env.X402SCAN_REGISTRY_TARGET || 'https://x402scan.com/api/x402/registry/register-origin';
const sellerOrigin = process.env.SELLER_ORIGIN || 'https://x402-gateway-production-1f21.up.railway.app';
const agent402IndexTarget = 'https://agent402.tools/api/index/register';
const agent402FindTarget = 'https://agent402.tools/api/find';
const agent402WishesTarget = 'https://agent402.tools/api/wishes';
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
  'crypto order book best bid ask'
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

  if (response.ok && Number.isFinite(toolCount) && toolCount >= 26) {
    await runFindDiagnostics();
    return;
  }

  if (response.ok && scheduleRetry && Number.isFinite(rereadSeconds) && rereadSeconds > 0 && rereadSeconds <= 3600) {
    const delayMs = (rereadSeconds + 5) * 1000;
    console.log('Agent402 re-index retry scheduled in', Math.round(delayMs / 1000), 'seconds');
    setTimeout(() => {
      registerAgent402OriginOnce({scheduleRetry:false}).then(runFindDiagnostics).catch((error) => {
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

fetchAgent402Wishes();
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
