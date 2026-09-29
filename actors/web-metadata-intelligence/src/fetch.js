import { lookup } from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

export const MAX_RESPONSE_BYTES = 3_000_000;
export const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home', '.lan'];

export function isPublicIpAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return !normalized || normalized === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export async function validatePublicUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error('URL is invalid.'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (parsed.username || parsed.password) throw new Error('Embedded URL credentials are not allowed.');
  if (isBlockedHostname(parsed.hostname)) throw new Error('Local or private hostnames are not allowed.');

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

async function readBodyWithLimit(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Response is too large (${declared} bytes; limit ${maxBytes}).`);
  }
  if (!response.body) return { body: '', bytes: 0 };

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded the ${maxBytes}-byte limit.`);
    }
    chunks.push(Buffer.from(value));
  }

  const buffer = Buffer.concat(chunks, total);
  return { body: new TextDecoder('utf-8', { fatal: false }).decode(buffer), bytes: total };
}

export async function fetchPublicPage(rawUrl, { timeoutSeconds = 30 } = {}) {
  let currentUrl = rawUrl;
  const started = Date.now();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const validated = await validatePublicUrl(currentUrl);
    const response = await fetch(validated, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'User-Agent': 'IndustrialPlatform-WebMetadataIntelligence/0.1'
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

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('html') && !contentType.toLowerCase().includes('xhtml')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}.`);
    }

    const { body, bytes } = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    return {
      body,
      bytes,
      finalUrl: validated.href,
      httpStatus: response.status,
      contentType,
      durationMs: Date.now() - started
    };
  }

  throw new Error('Too many redirects.');
}
