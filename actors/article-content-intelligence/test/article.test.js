import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArticle } from '../src/extract.js';
import { isPublicIpAddress, validatePublicUrl } from '../src/fetch.js';

test('extractArticle returns substantial article text and metadata', () => {
  const html = `<!doctype html>
  <html lang="en"><head>
  <title>Fallback title</title>
  <meta name="description" content="Summary here">
  <meta name="author" content="Jane Doe">
  <link rel="canonical" href="/story">
  </head><body>
  <article><h1>Primary headline</h1>
  <p>This is the first substantial paragraph of the article and contains enough text to qualify for extraction.</p>
  <p>This is the second substantial paragraph with additional information for readers and downstream agents.</p>
  </article></body></html>`;

  const result = extractArticle(html, 'https://example.com/a');
  assert.equal(result.title, 'Primary headline');
  assert.equal(result.author, 'Jane Doe');
  assert.equal(result.canonical, 'https://example.com/story');
  assert.match(result.text, /first substantial paragraph/);
  assert.equal(result.word_count > 20, true);
  assert.equal(result.reading_time_minutes >= 1, true);
});

test('private IPs are blocked', async () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
});

test('non-http schemes are rejected', async () => {
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd'), /Only http/i);
});
