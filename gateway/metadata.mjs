import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import ipaddr from 'ipaddr.js';

const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home', '.lan'];

function isPublicIpAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return !normalized || normalized === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

async function validatePublicUrl(rawUrl) {
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

async function fetchPublicPage(rawUrl, { timeoutSeconds = 30 } = {}) {
  let currentUrl = rawUrl;
  const started = Date.now();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const validated = await validatePublicUrl(currentUrl);
    const response = await fetch(validated, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'User-Agent': 'IndustrialPlatform-WebMetadataIntelligence/1.0'
      },
      signal: AbortSignal.timeout(timeoutSeconds * 1000)
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
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

function clean(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || undefined;
}

function absoluteUrl(value, base) {
  const cleaned = clean(value);
  if (!cleaned) return undefined;
  try { return new URL(cleaned, base).href; }
  catch { return cleaned; }
}

function collectMeta($, prefix) {
  const out = {};
  $('meta').each((_, el) => {
    const key = clean($(el).attr('property')) ?? clean($(el).attr('name'));
    if (!key || !key.toLowerCase().startsWith(prefix.toLowerCase())) return;
    const value = clean($(el).attr('content'));
    if (!value) return;
    const shortKey = key.slice(prefix.length).replace(/^:/, '');
    if (!shortKey) return;
    if (out[shortKey] === undefined) out[shortKey] = value;
    else if (Array.isArray(out[shortKey])) out[shortKey].push(value);
    else out[shortKey] = [out[shortKey], value];
  });
  return out;
}

function extractMetadata(html, finalUrl) {
  const $ = cheerio.load(html);
  const getMeta = (...names) => {
    for (const name of names) {
      for (const selector of [`meta[name="${name}"]`, `meta[property="${name}"]`]) {
        const value = clean($(selector).first().attr('content'));
        if (value) return value;
      }
    }
    return undefined;
  };

  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd.length >= 20) return;
    const raw = $(el).text().trim();
    if (!raw) return;
    try { jsonLd.push(JSON.parse(raw)); }
    catch { jsonLd.push({ _parse_error: true, raw: raw.slice(0, 4000) }); }
  });

  const icons = [];
  $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const href = absoluteUrl($(el).attr('href'), finalUrl);
    if (href && !icons.includes(href) && icons.length < 10) icons.push(href);
  });

  return {
    title: clean($('title').first().text()),
    description: getMeta('description', 'og:description'),
    canonical: absoluteUrl($('link[rel="canonical"]').first().attr('href'), finalUrl),
    robots: getMeta('robots'),
    author: getMeta('author'),
    generator: getMeta('generator'),
    language: clean($('html').attr('lang')),
    charset: clean($('meta[charset]').first().attr('charset')) ??
      clean($('meta[http-equiv="content-type"]').first().attr('content')),
    favicon_urls: icons,
    headings: {
      h1: $('h1').slice(0, 10).map((_, el) => clean($(el).text())).get().filter(Boolean),
      h2: $('h2').slice(0, 20).map((_, el) => clean($(el).text())).get().filter(Boolean)
    },
    open_graph: collectMeta($, 'og'),
    twitter: collectMeta($, 'twitter'),
    json_ld: jsonLd
  };
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return output;
}

export async function runMetadata(input = {}) {
  const urls = [...new Set(
    (Array.isArray(input.urls) ? input.urls : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
  )];

  if (!urls.length) throw Object.assign(new Error('urls must contain at least one URL.'), { statusCode: 400 });
  if (urls.length > 100) throw Object.assign(new Error('A maximum of 100 URLs is supported per request.'), { statusCode: 400 });

  const timeoutSeconds = Number.isInteger(input.timeout_seconds)
    ? Math.min(60, Math.max(5, input.timeout_seconds))
    : 30;
  const concurrency = Number.isInteger(input.concurrency)
    ? Math.min(20, Math.max(1, input.concurrency))
    : 10;

  const results = await mapLimit(urls, concurrency, async (url) => {
    try {
      const fetched = await fetchPublicPage(url, { timeoutSeconds });
      return {
        status: 'ready',
        url,
        final_url: fetched.finalUrl,
        fetched_at: new Date().toISOString(),
        http_status: fetched.httpStatus,
        content_type: fetched.contentType,
        response_bytes: fetched.bytes,
        latency_ms: fetched.durationMs,
        ...extractMetadata(fetched.body, fetched.finalUrl)
      };
    } catch (error) {
      return {
        status: 'error',
        url,
        error: error instanceof Error ? error.message : String(error),
        fetched_at: new Date().toISOString()
      };
    }
  });

  const summary = {
    status: 'ready',
    requested: urls.length,
    succeeded: results.filter((r) => r.status === 'ready').length,
    failed: results.filter((r) => r.status === 'error').length
  };

  if (summary.succeeded === 0) {
    const err = new Error(results[0]?.error || 'All metadata fetches failed.');
    err.statusCode = 502;
    err.payload = { summary, results };
    throw err;
  }

  return { summary, results };
}
