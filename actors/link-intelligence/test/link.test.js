import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../src/parser.js';
import { isPublicIpAddress, validatePublicUrl } from '../src/fetch.js';

const html = `<!doctype html>
<html>
  <body>
    <header><a href="/home"> Home </a></header>
    <main>
      <a href="/docs#intro" rel="nofollow ugc">Docs</a>
      <a href="https://other.example/path" target="_blank">External</a>
      <a href="/docs#other">Docs duplicate</a>
      <a href="mailto:test@example.com">Email</a>
    </main>
    <footer><a href="/privacy" rel="sponsored">Privacy</a></footer>
  </body>
</html>`;

test('extractLinks produces structured agent-oriented records', () => {
  const result = extractLinks(html, 'https://example.com/page');
  assert.equal(result.total_links, 6);
  assert.equal(result.eligible_links, 5);
  assert.equal(result.unique_links, 4);
  assert.equal(result.internal_links, 4);
  assert.equal(result.external_links, 1);
  assert.equal(result.non_http_links, 0);
  assert.equal(result.returned_links, 5);
  assert.equal(result.links[0].url, 'https://example.com/home');
  assert.equal(result.links[0].location, 'header');
  assert.equal(result.links[1].url, 'https://example.com/docs');
  assert.equal(result.links[1].nofollow, true);
  assert.equal(result.links[1].ugc, true);
  assert.equal(result.links[2].internal, false);
  assert.equal(result.links[4].sponsored, true);
  assert.equal(result.links[4].location, 'footer');
});

test('deduplication and non-http inclusion are configurable', () => {
  const result = extractLinks(html, 'https://example.com/page', {
    deduplicate: true,
    includeNonHttp: true,
    includeFragments: false
  });
  assert.equal(result.eligible_links, 6);
  assert.equal(result.unique_links, 5);
  assert.equal(result.non_http_links, 1);
  assert.equal(result.returned_links, 5);
  assert.ok(result.links.some((link) => link.protocol === 'mailto:'));
});

test('fragments can be retained and output can be truncated', () => {
  const result = extractLinks(html, 'https://example.com/page', {
    includeFragments: true,
    maxLinks: 2
  });
  assert.equal(result.links[1].url, 'https://example.com/docs#intro');
  assert.equal(result.returned_links, 2);
  assert.equal(result.truncated, true);
});

test('IP safety classification rejects private/special ranges', async () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('169.254.169.254'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
});

test('non-http input schemes are rejected', async () => {
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd'), /Only http/i);
});
