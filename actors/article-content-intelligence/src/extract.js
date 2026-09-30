import * as cheerio from 'cheerio';

function clean(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text || undefined;
}

function meta($, ...names) {
  for (const name of names) {
    for (const selector of [`meta[name="${name}"]`, `meta[property="${name}"]`]) {
      const value = clean($(selector).first().attr('content'));
      if (value) return value;
    }
  }
  return undefined;
}

function absoluteUrl(value, base) {
  const v = clean(value);
  if (!v) return undefined;
  try { return new URL(v, base).href; }
  catch { return v; }
}

function removeNoise($, root) {
  root.find('script,style,noscript,template,svg,canvas,iframe,form,nav,footer,aside').remove();
}

function candidateScore($, el) {
  const node = $(el);
  const text = clean(node.text()) ?? '';
  const paragraphCount = node.find('p').length;
  const linkText = node.find('a').map((_, a) => $(a).text()).get().join(' ').length;
  const linkDensity = text.length ? linkText / text.length : 1;
  return text.length + paragraphCount * 180 - linkDensity * text.length * 1.2;
}

function chooseRoot($) {
  const semantic = $('article').first();
  if (semantic.length && (clean(semantic.text()) ?? '').length >= 200) return semantic;

  const main = $('main').first();
  if (main.length && (clean(main.text()) ?? '').length >= 200) return main;

  const candidates = $('section,div').toArray()
    .map((el) => ({ el, score: candidateScore($, el) }))
    .sort((a, b) => b.score - a.score);

  return candidates.length ? $(candidates[0].el) : $('body');
}

export function extractArticle(html, finalUrl, { maxTextChars = 100_000 } = {}) {
  const $ = cheerio.load(html);
  const root = chooseRoot($);
  removeNoise($, root);

  const paragraphs = root.find('p')
    .map((_, p) => clean($(p).text()))
    .get()
    .filter((p) => p && p.length >= 20)
    .slice(0, 500);

  let text = paragraphs.join('\n\n');
  if (text.length < 200) text = clean(root.text()) ?? '';

  const originalTextLength = text.length;
  const truncated = text.length > maxTextChars;
  if (truncated) text = text.slice(0, maxTextChars);

  const author = meta($, 'author', 'article:author', 'byl');
  const published = meta($, 'article:published_time', 'date', 'datePublished', 'pubdate');
  const modified = meta($, 'article:modified_time', 'last-modified', 'dateModified');

  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd.length >= 10) return;
    const raw = $(el).text().trim();
    if (!raw) return;
    try { jsonLd.push(JSON.parse(raw)); }
    catch {}
  });

  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    title: clean($('h1').first().text()) ?? clean($('title').first().text()),
    description: meta($, 'description', 'og:description'),
    author,
    published_at: published,
    modified_at: modified,
    canonical: absoluteUrl($('link[rel="canonical"]').first().attr('href'), finalUrl),
    language: clean($('html').attr('lang')),
    text,
    word_count: wordCount,
    reading_time_minutes: wordCount ? Math.max(1, Math.ceil(wordCount / 225)) : 0,
    text_truncated: truncated,
    original_text_length: originalTextLength,
    json_ld: jsonLd
  };
}
