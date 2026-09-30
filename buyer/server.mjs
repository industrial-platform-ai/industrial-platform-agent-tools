import http from 'node:http';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const PORT = Number(process.env.PORT || 3000);
const TARGET = process.env.X402_TARGET || 'https://x402-gateway-production-1f21.up.railway.app/metadata';
const key = process.env.EVM_PRIVATE_KEY;
const runPayment = process.env.RUN_PAYMENT === '1';

let state = {
  startedAt: new Date().toISOString(),
  enabled: runPayment,
  target: TARGET,
  status: runPayment ? 'pending' : 'armed',
  result: null,
  error: null,
};

async function payOnce() {
  if (!key) throw new Error('EVM_PRIVATE_KEY missing');
  const signer = privateKeyToAccount(key);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);

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
    body: text.slice(0, 20000),
    completedAt: new Date().toISOString(),
  };
  state.status = response.ok ? 'paid' : 'failed';
  if (!response.ok) throw new Error('Paid request returned HTTP ' + response.status);
}

if (runPayment) {
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
