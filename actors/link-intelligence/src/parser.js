import * as cheerio from 'cheerio';

function clean(value, maxLength = 1000) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function locationFor($, element) {
  const node = $(element);
  if (node.closest('nav').length) return 'nav';
  if (node.closest('header').length) return 'header';
  if (node.closest('main').length) return 'main';
  if (node.closest('article').length) return 'article';
  if (node.closest('aside').length) return 'aside';
  if (node.closest('footer').length) return 'footer';
  return 'body';
}

function normalizeTarget(href, baseUrl, includeFragments) {
  const raw = clean(href, 4096);
  if (!raw) return null;

  let parsed;
  try { parsed = new URL(raw, baseUrl); }
  catch {
    return {
      url: raw,
      protocol: 'invalid:',
      http: false,
      internal: false
    };
  }

  const http = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  if (http && !includeFragments) parsed.hash = '';

  const base = new URL(baseUrl);
  return {
    url: parsed.href,
    protocol: parsed.protocol,
    http,
    internal: http && parsed.origin === base.origin
  };
}

export function extractLinks(html, finalUrl, {
  maxLinks = 1000,
  deduplicate = false,
  includeNonHttp = false,
  includeFragments = false
} = {}) {
  const $ = cheerio.load(html);
  const candidates = [];
  const uniqueTargets = new Set();

  let totalLinks = 0;
  let eligibleLinks = 0;
  let internalLinks = 0;
  let externalLinks = 0;
  let nonHttpLinks = 0;

  $('a[href]').each((_, element) => {
    const rawHref = clean($(element).attr('href'), 4096);
    if (!rawHref) return;
    totalLinks += 1;

    const target = normalizeTarget(rawHref, finalUrl, includeFragments);
    if (!target) return;

    if (!target.http && !includeNonHttp) return;
    eligibleLinks += 1;

    if (target.http) {
      if (target.internal) internalLinks += 1;
      else externalLinks += 1;
    } else {
      nonHttpLinks += 1;
    }

    uniqueTargets.add(target.url);
    if (deduplicate && candidates.some((entry) => entry.url === target.url)) return;

    const rel = (clean($(element).attr('rel'), 500) ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    candidates.push({
      url: target.url,
      href: rawHref,
      text: clean($(element).text(), 500) ?? '',
      rel,
      target: clean($(element).attr('target'), 100) ?? '',
      protocol: target.protocol,
      internal: target.http ? target.internal : false,
      nofollow: rel.includes('nofollow'),
      ugc: rel.includes('ugc'),
      sponsored: rel.includes('sponsored'),
      location: locationFor($, element)
    });
  });

  return {
    total_links: totalLinks,
    eligible_links: eligibleLinks,
    returned_links: Math.min(candidates.length, maxLinks),
    unique_links: uniqueTargets.size,
    internal_links: internalLinks,
    external_links: externalLinks,
    non_http_links: nonHttpLinks,
    truncated: candidates.length > maxLinks,
    links: candidates.slice(0, maxLinks)
  };
}
