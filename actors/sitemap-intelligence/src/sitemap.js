import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false
});

function arrayify(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseRobotsForSitemaps(text, baseUrl) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*Sitemap\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!out.includes(url)) out.push(url);
    } catch {}
  }
  return out;
}

export function parseSitemapDocument(text, sourceUrl) {
  const trimmed = String(text ?? '').trim();

  if (!trimmed.startsWith('<')) {
    const urls = trimmed.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line))
      .map((url) => ({ url, source_sitemap: sourceUrl }));
    return { type: 'urlset', urls, childSitemaps: [] };
  }

  const parsed = parser.parse(trimmed);

  if (parsed.sitemapindex) {
    const childSitemaps = arrayify(parsed.sitemapindex.sitemap)
      .map((item) => typeof item === 'string' ? item : item?.loc)
      .map(clean)
      .filter(Boolean);
    return { type: 'index', urls: [], childSitemaps };
  }

  if (parsed.urlset) {
    const urls = arrayify(parsed.urlset.url)
      .map((item) => {
        if (typeof item === 'string') return { url: item, source_sitemap: sourceUrl };
        const url = clean(item?.loc);
        if (!url) return null;
        return {
          url,
          lastmod: clean(item?.lastmod),
          changefreq: clean(item?.changefreq),
          priority: clean(item?.priority),
          source_sitemap: sourceUrl
        };
      })
      .filter(Boolean);
    return { type: 'urlset', urls, childSitemaps: [] };
  }

  if (parsed.rss?.channel?.item) {
    const urls = arrayify(parsed.rss.channel.item)
      .map((item) => {
        const url = clean(item?.link);
        return url ? { url, lastmod: clean(item?.pubDate), source_sitemap: sourceUrl } : null;
      })
      .filter(Boolean);
    return { type: 'urlset', urls, childSitemaps: [] };
  }

  if (parsed.feed?.entry) {
    const urls = arrayify(parsed.feed.entry)
      .map((entry) => {
        const links = arrayify(entry?.link);
        const href = links.map((link) => typeof link === 'string' ? link : link?.['@_href']).find(Boolean);
        return href ? { url: href, lastmod: clean(entry?.updated), source_sitemap: sourceUrl } : null;
      })
      .filter(Boolean);
    return { type: 'urlset', urls, childSitemaps: [] };
  }

  throw new Error('Document is not a supported sitemap, sitemap index, RSS, Atom, or plain URL list.');
}

export function defaultDiscoveryUrls(raw) {
  const input = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(input);
  const lower = parsed.pathname.toLowerCase();

  if (lower.endsWith('.xml') || lower.endsWith('.xml.gz') || lower.endsWith('.txt') || lower.endsWith('.gz')) {
    return { direct: [parsed.href], robots: null };
  }

  return {
    direct: [new URL('/sitemap.xml', parsed.origin).href],
    robots: new URL('/robots.txt', parsed.origin).href
  };
}
