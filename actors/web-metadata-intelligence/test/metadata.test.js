import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadata } from '../src/parser.js';
import { isPublicIpAddress, validatePublicUrl } from '../src/fetch.js';

test('extractMetadata returns agent-oriented metadata', () => {
  const html = `<!doctype html>
  <html lang="en">
    <head>
      <title>Example Product</title>
      <meta name="description" content="A useful page">
      <meta name="robots" content="index,follow">
      <meta property="og:title" content="OG Product">
      <meta name="twitter:card" content="summary">
      <link rel="canonical" href="/canonical">
      <link rel="icon" href="/favicon.ico">
      <script type="application/ld+json">{"@type":"Product","name":"Thing"}</script>
    </head>
    <body><h1>Main heading</h1><h2>Details</h2></body>
  </html>`;

  const result = extractMetadata(html, 'https://example.com/page');
  assert.equal(result.title, 'Example Product');
  assert.equal(result.description, 'A useful page');
  assert.equal(result.canonical, 'https://example.com/canonical');
  assert.equal(result.language, 'en');
  assert.equal(result.open_graph.title, 'OG Product');
  assert.equal(result.twitter.card, 'summary');
  assert.deepEqual(result.headings.h1, ['Main heading']);
  assert.equal(result.json_ld[0]['@type'], 'Product');
  assert.equal(result.favicon_urls[0], 'https://example.com/favicon.ico');
});

test('IP safety classification rejects private/special ranges', async () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('169.254.169.254'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
});

test('non-http schemes are rejected', async () => {
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd'), /Only http/i);
});
