export async function verifyVet402PayeeNoSpend({ sellerAccount, sellerOrigin }) {
  if (!sellerAccount) throw new Error('sellerAccount unavailable');
  const wallet = sellerAccount.address;
  const name = 'Industrial Platform Agent Utility Market';
  const url = sellerOrigin;
  const q = new URLSearchParams({ wallet, name, url });
  const previewUrl = 'https://vet402.com/api/v1/payees/verify?' + q.toString();

  const preview = await fetch(previewUrl, {
    headers: { accept: 'application/json', 'user-agent': 'IndustrialPlatform-NoSpendBootstrap/1.0' },
    signal: AbortSignal.timeout(20000)
  });
  const previewText = await preview.text();
  let previewJson = null;
  try { previewJson = JSON.parse(previewText); } catch {}
  if (!preview.ok || !previewJson?.message || !previewJson?.issued) {
    console.log('vet402 payee preview:', JSON.stringify({
      httpStatus: preview.status,
      ok: preview.ok,
      body: previewText.slice(0, 6000)
    }));
    return;
  }

  const signature = await sellerAccount.signMessage({ message: previewJson.message });
  const response = await fetch('https://vet402.com/api/v1/payees/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'IndustrialPlatform-NoSpendBootstrap/1.0'
    },
    body: JSON.stringify({
      wallet,
      name,
      url,
      issued: previewJson.issued,
      signature
    }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  console.log('vet402 payee verification:', JSON.stringify({
    httpStatus: response.status,
    ok: response.ok,
    wallet,
    body: body.slice(0, 8000),
    completedAt: new Date().toISOString()
  }));
}

export async function submitX402ListNoSpend({ sellerOrigin }) {
  const payload = {
    url: sellerOrigin,
    email: 'art@naturalist.gallery',
    service_name: 'Industrial Platform Agent Utility Market',
    description: 'Low-cost x402 APIs for AI agents: web extraction, crypto market data, DNS, security checks, robots policy, hashing, encoding, text utilities, and research tools.',
    website_url: sellerOrigin,
    category: 'Tools',
    endpoints: [
      '/metadata',
      '/change',
      '/read',
      '/article',
      '/web/dossier',
      '/crypto/price',
      '/crypto/stats',
      '/crypto/book',
      '/crypto/candles',
      '/crypto/trades',
      '/crypto/snapshot',
      '/dns',
      '/http/headers',
      '/robots/check',
      '/hash',
      '/checksum',
      '/hmac',
      '/base64',
      '/jwt/decode',
      '/url/inspect',
      '/text/chunk',
      '/html/text',
      '/html/links',
      '/html/meta',
      '/json/schema/validate',
      '/html/markdown',
      '/text/entities',
      '/http/status',
      '/rss/json',
      '/sitemap/urls',
      '/web/links',
      '/json/repair'
    ],
    notes: 'Durable Railway origin. Base, Polygon, and Arbitrum USDC x402. Public machine-readable discovery at /.well-known/x402 and /openapi.json.'
  };

  const response = await fetch('https://x402-list.com/api/v1/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'IndustrialPlatform-NoSpendBootstrap/1.0'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  console.log('x402 List submission:', JSON.stringify({
    httpStatus: response.status,
    ok: response.ok,
    body: body.slice(0, 10000),
    completedAt: new Date().toISOString()
  }));

  if (response.status === 402) {
    console.log('x402 List requested payment; no-spend policy preserved and no retry attempted.');
  }
}
