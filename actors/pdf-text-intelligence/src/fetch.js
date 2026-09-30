import { lookup } from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

export const MAX_PDF_BYTES = 15_000_000;
export const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home', '.lan'];

export function isPublicIpAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

function blockedHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return !h || h === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

export async function validatePublicUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error('URL is invalid.'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (parsed.username || parsed.password) throw new Error('Embedded URL credentials are not allowed.');
  if (blockedHostname(parsed.hostname)) throw new Error('Local or private hostnames are not allowed.');

  if (net.isIP(parsed.hostname)) {
    if (!isPublicIpAddress(parsed.hostname)) {
      throw new Error('Private, loopback, link-local, multicast, or reserved IP addresses are not allowed.');
    }
    return parsed;
  }

  const records = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error('Hostname did not resolve.');
  for (const record of records) {
    if (!isPublicIpAddress(record.address)) throw new Error('Hostname resolves to a non-public IP address.');
  }

  return parsed;
}

async function readBuffer(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`PDF is too large (${declared} bytes; limit ${maxBytes}).`);
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`PDF exceeded the ${maxBytes}-byte limit.`);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, total);
}

export async function fetchPublicPdf(rawUrl, { timeoutSeconds = 45 } = {}) {
  let currentUrl = rawUrl;
  const started = Date.now();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const validated = await validatePublicUrl(currentUrl);

    const response = await fetch(validated, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/pdf,application/octet-stream;q=0.8,*/*;q=0.2',
        'User-Agent': 'IndustrialPlatform-PDFTextIntelligence/0.1'
      },
      signal: AbortSignal.timeout(timeoutSeconds * 1000)
    });

    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`HTTP ${response.status} redirect missing Location header.`);
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects.');
      currentUrl = new URL(location, validated).href;
      continue;
    }

    if (!response.ok) throw new Error(`Target returned HTTP ${response.status} ${response.statusText}.`);

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const buffer = await readBuffer(response, MAX_PDF_BYTES);

    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`Response is not a valid PDF (content type: ${contentType || 'unknown'}).`);
    }

    return {
      buffer,
      finalUrl: validated.href,
      httpStatus: response.status,
      contentType,
      bytes: buffer.length,
      durationMs: Date.now() - started
    };
  }

  throw new Error('Too many redirects.');
}
