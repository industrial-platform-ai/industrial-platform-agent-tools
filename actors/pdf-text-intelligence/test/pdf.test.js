import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdf } from '../src/pdf.js';
import { isPublicIpAddress, validatePublicUrl } from '../src/fetch.js';

const samplePdf = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n' +
  '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n' +
  '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n' +
  '4 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 72 720 Td (Hello PDF world) Tj ET\nendstream\nendobj\n' +
  '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n' +
  'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000261 00000 n \n0000000354 00000 n \n' +
  'trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n424\n%%EOF\n',
  'ascii'
);

test('extractPdf reads text from a simple PDF', async () => {
  const result = await extractPdf(samplePdf, { maxPages: 10, maxTextChars: 10000 });
  assert.equal(result.page_count, 1);
  assert.match(result.text, /Hello PDF world/);
  assert.equal(result.extracted_pages, 1);
});

test('private IPs are blocked', async () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
});

test('non-http schemes are rejected', async () => {
  await assert.rejects(() => validatePublicUrl('file:///tmp/x.pdf'), /Only http/i);
});
