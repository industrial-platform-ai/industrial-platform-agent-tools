import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { diffLines } from 'diff';
import ipaddr from 'ipaddr.js';

export const DEFAULT_MAX_TEXT_CHARS = 100_000;
export const HARD_MAX_TEXT_CHARS = 250_000;
export const DEFAULT_MAX_DIFF_CHARS = 12_000;
export const HARD_MAX_DIFF_CHARS = 50_000;
export const MAX_RESPONSE_BYTES = 5_000_000;
export const MAX_REDIRECTS = 5;

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home',
  '.lan'
];

const BLOCK_TAGS = [
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
];

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJsonValue(value[key])])
    );
  }

  return value;
}

export function canonicalizeJson(text) {
  const parsed = JSON.parse(text);
  return JSON.stringify(canonicalizeJsonValue(parsed), null, 2);
}

function truncateText(value, maxChars) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  return {
    text: value.slice(0, maxChars),
    truncated: true
  };
}

export function extractNormalizedContent({
  body,
  contentType = '',
  selector,
  ignoreSelectors = [],
  maxTextChars = DEFAULT_MAX_TEXT_CHARS
}) {
  const normalizedType = String(contentType).toLowerCase();
  let title;
  let text;

  if (
    normalizedType.includes('application/json') ||
    normalizedType.includes('+json') ||
    (!normalizedType && /^[\s\n\r]*[\[{]/.test(body))
  ) {
    try {
      text = canonicalizeJson(body);
    } catch {
      text = normalizeText(body);
    }
  } else if (
    normalizedType.includes('text/html') ||
    normalizedType.includes('application/xhtml+xml') ||
    normalizedType.includes('xml') ||
    (!normalizedType && /^[\s\n\r]*</.test(body))
  ) {
    const xmlMode = normalizedType.includes('xml') && !normalizedType.includes('xhtml');
    const $ = cheerio.load(body, { xmlMode });

    $('script, style, noscript, template, svg, canvas, iframe').remove();

    for (const ignoredSelector of ignoreSelectors) {
      if (!ignoredSelector) continue;
      try {
        $(ignoredSelector).remove();
      } catch (error) {
        throw new Error(
          `Invalid ignore selector "${ignoredSelector}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (!xmlMode) {
      title = normalizeText($('title').first().text()) || undefined;
      $('br').replaceWith('\n');
      $(BLOCK_TAGS.join(',')).each((_, element) => {
        $(element).append('\n');
      });
    }

    let selected;
    if (selector) {
      try {
        selected = $(selector);
      } catch (error) {
        throw new Error(
          `Invalid selector "${selector}": ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (selected.length === 0) {
        throw new Error(`Selector "${selector}" did not match any content.`);
      }
    } else {
      selected = xmlMode ? $.root() : $('body').length ? $('body') : $.root();
    }

    text = normalizeText(selected.text());
  } else if (
    normalizedType.startsWith('text/') ||
    normalizedType.includes('javascript') ||
    normalizedType.includes('graphql') ||
    normalizedType.includes('yaml') ||
    normalizedType.includes('csv') ||
    !normalizedType
  ) {
    text = normalizeText(body);
  } else {
    throw new Error(`Unsupported content type: ${contentType || 'unknown'}.`);
  }

  const originalTextLength = text.length;
  const truncated = truncateText(text, maxTextChars);

  return {
    title,
    text: truncated.text,
    textTruncated: truncated.truncated,
    originalTextLength
  };
}

export function hashContent(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function truncateDiff(value, maxChars) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 16))}\n...[truncated]`;
}

export function compareText(previousText, currentText, maxDiffChars = DEFAULT_MAX_DIFF_CHARS) {
  const parts = diffLines(previousText, currentText);
  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;
  let addedBlocks = 0;
  let removedBlocks = 0;
  const added = [];
  const removed = [];

  for (const part of parts) {
    if (part.added) {
      addedChars += part.value.length;
      addedBlocks += 1;
      added.push(part.value.trim());
    } else if (part.removed) {
      removedChars += part.value.length;
      removedBlocks += 1;
      removed.push(part.value.trim());
    } else {
      unchangedChars += part.value.length;
    }
  }

  const denominator = unchangedChars * 2 + addedChars + removedChars;
  const changeRatio = denominator === 0 ? 0 : (addedChars + removedChars) / denominator;

  return {
    added_chars: addedChars,
    removed_chars: removedChars,
    added_blocks: addedBlocks,
    removed_blocks: removedBlocks,
    change_ratio: Number(changeRatio.toFixed(6)),
    added_excerpt: truncateDiff(added.filter(Boolean).join('\n'), maxDiffChars),
    removed_excerpt: truncateDiff(removed.filter(Boolean).join('\n'), maxDiffChars)
  };
}

export function isPublicIpAddress(address) {
  let parsed;
  try {
    parsed = ipaddr.process(address);
  } catch {
    return false;
  }

  return parsed.range() === 'unicast';
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost') return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export async function validatePublicUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs containing embedded credentials are not allowed.');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Local or private hostnames are not allowed.');
  }

  if (net.isIP(parsed.hostname)) {
    if (!isPublicIpAddress(parsed.hostname)) {
      throw new Error('Private, loopback, link-local, multicast, or reserved IP addresses are not allowed.');
    }
    return parsed;
  }

  let records;
  try {
    records = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `Could not resolve hostname ${parsed.hostname}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!records.length) {
    throw new Error(`Hostname ${parsed.hostname} did not resolve to an IP address.`);
  }

  for (const record of records) {
    if (!isPublicIpAddress(record.address)) {
      throw new Error(
        `Hostname ${parsed.hostname} resolves to a non-public IP address, so the request was blocked.`
      );
    }
  }

  return parsed;
}

async function readBodyWithLimit(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Response is too large (${declaredLength} bytes; limit is ${maxBytes}).`);
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
  return {
    body: new TextDecoder('utf-8', { fatal: false }).decode(buffer),
    bytes: total
  };
}

export async function fetchPublicText(
  rawUrl,
  {
    timeoutSeconds = 30,
    maxBytes = MAX_RESPONSE_BYTES,
    maxRedirects = MAX_REDIRECTS,
    userAgent = 'IndustrialPlatform-WebChangeIntelligence/0.1 (+https://github.com/industrial-platform-ai/industrial-platform-agent-tools)'
  } = {}
) {
  let currentUrl = rawUrl;
  const startedAt = Date.now();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validated = await validatePublicUrl(currentUrl);

    let response;
    try {
      response = await fetch(validated, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.5',
          'User-Agent': userAgent
        },
        signal: AbortSignal.timeout(timeoutSeconds * 1000)
      });
    } catch (error) {
      throw new Error(
        `Fetch failed for ${validated.href}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Received HTTP ${response.status} redirect without a Location header.`);
      }
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects (maximum ${maxRedirects}).`);
      }
      currentUrl = new URL(location, validated).href;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Target returned HTTP ${response.status} ${response.statusText}.`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const { body, bytes } = await readBodyWithLimit(response, maxBytes);

    return {
      body,
      bytes,
      contentType,
      httpStatus: response.status,
      finalUrl: validated.href,
      durationMs: Date.now() - startedAt
    };
  }

  throw new Error(`Too many redirects (maximum ${maxRedirects}).`);
}

export function validateComparisonInput({ previousText, previousHash }) {
  if (previousHash && !/^[a-f0-9]{64}$/i.test(previousHash)) {
    throw new Error('previous_hash must be a 64-character SHA-256 hex digest.');
  }

  if (previousText !== undefined && previousText !== null && typeof previousText !== 'string') {
    throw new Error('previous_text must be a string when supplied.');
  }

  if (previousText && previousHash) {
    const calculated = hashContent(previousText);
    if (calculated.toLowerCase() !== previousHash.toLowerCase()) {
      throw new Error(
        'previous_text does not match previous_hash. Supply the exact previous normalized text or omit one of the two fields.'
      );
    }
  }
}
