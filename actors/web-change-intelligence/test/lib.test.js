import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeJson,
  compareText,
  extractNormalizedContent,
  hashContent,
  isPublicIpAddress,
  normalizeText,
  validateComparisonInput,
  validatePublicUrl
} from '../src/lib.js';

test('normalizeText removes unstable whitespace while preserving logical lines', () => {
  assert.equal(normalizeText('  Alpha   beta\n\n Gamma\t delta  '), 'Alpha beta\nGamma delta');
});

test('canonicalizeJson sorts object keys recursively', () => {
  assert.equal(
    canonicalizeJson('{"z":1,"a":{"y":2,"b":3}}'),
    '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}'
  );
});

test('HTML extraction strips scripts and can focus a selector', () => {
  const result = extractNormalizedContent({
    body: '<html><head><title>Test</title><script>noise()</script></head><body><main><p>Hello</p><p>World</p></main><footer>Ignore me</footer></body></html>',
    contentType: 'text/html; charset=utf-8',
    selector: 'main',
    maxTextChars: 1000
  });

  assert.equal(result.title, 'Test');
  assert.equal(result.text, 'Hello\nWorld');
  assert.equal(result.textTruncated, false);
});

test('ignore selectors remove volatile sections', () => {
  const result = extractNormalizedContent({
    body: '<body><div class="stable">Price $10</div><div class="clock">12:44:01</div></body>',
    contentType: 'text/html',
    ignoreSelectors: ['.clock'],
    maxTextChars: 1000
  });
  assert.equal(result.text, 'Price $10');
});

test('text is truncated before hashing/return for deterministic chaining', () => {
  const result = extractNormalizedContent({
    body: 'abcdefghij',
    contentType: 'text/plain',
    maxTextChars: 5
  });
  assert.equal(result.text, 'abcde');
  assert.equal(result.textTruncated, true);
  assert.equal(result.originalTextLength, 10);
});

test('compareText returns deterministic change metrics and excerpts', () => {
  const diff = compareText('Alpha\nBeta', 'Alpha\nGamma', 1000);
  assert.equal(diff.added_chars > 0, true);
  assert.equal(diff.removed_chars > 0, true);
  assert.match(diff.added_excerpt, /Gamma/);
  assert.match(diff.removed_excerpt, /Beta/);
  assert.equal(diff.change_ratio > 0, true);
});

test('hashContent produces SHA-256', () => {
  assert.equal(hashContent('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('IP classification blocks private/special ranges and allows public unicast', () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('169.254.169.254'), false);
  assert.equal(isPublicIpAddress('::1'), false);
  assert.equal(isPublicIpAddress('fc00::1'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
});

test('validatePublicUrl rejects localhost and non-http schemes without DNS', async () => {
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd'), /Only http/i);
  await assert.rejects(() => validatePublicUrl('http://localhost/'), /not allowed/i);
});

test('validateComparisonInput detects inconsistent hash/text pairs', () => {
  assert.throws(
    () => validateComparisonInput({ previousText: 'abc', previousHash: '0'.repeat(64) }),
    /does not match/i
  );
  assert.doesNotThrow(() =>
    validateComparisonInput({ previousText: 'abc', previousHash: hashContent('abc') })
  );
});
