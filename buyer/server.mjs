import http from 'node:http';
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

let state = {
  startedAt: new Date().toISOString(),
  enabled: runPayment || runRegistry,
  mode: runRegistry ? 'x402scan-registration' : (runPayment ? 'payment' : 'idle'),
  target: TARGET,
  status: runPayment ? 'pending' : 'armed',
  result: null,
  error: null,
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
  const response = await paidFetch(TARGET, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls: ['https://example.com/'] }),
  });

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
  if (req.url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(state));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}).listen(PORT, '0.0.0.0', () => {
  console.log('x402 seed buyer listening on', PORT, 'payment state:', state.status);
});
