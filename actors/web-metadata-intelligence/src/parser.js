import * as cheerio from 'cheerio';

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

export function extractMetadata(html, finalUrl) {
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
