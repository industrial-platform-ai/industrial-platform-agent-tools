import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDiscoveryUrls,
  parseRobotsForSitemaps,
  parseSitemapDocument
} from '../src/sitemap.js';
import { isPublicIpAddress, validatePublicUrl } from '../src/fetch.js';

test('parse sitemap urlset with metadata', () => {
  const xml = `<?xml version="1.0"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://example.com/a</loc><lastmod>2026-09-01</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
    <url><loc>https://example.com/b</loc></url>
  </urlset>`;
  const result = parseSitemapDocument(xml, 'https://example.com/sitemap.xml');
  assert.equal(result.type, 'urlset');
  assert.equal(result.urls.length, 2);
  assert.equal(result.urls[0].url, 'https://example.com/a');
  assert.equal(result.urls[0].lastmod, '2026-09-01');
});

test('parse sitemap index', () => {
  const xml = `<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://example.com/b.xml.gz</loc></sitemap></sitemapindex>`;
  const result = parseSitemapDocument(xml, 'https://example.com/sitemap.xml');
  assert.deepEqual(result.childSitemaps, [
    'https://example.com/a.xml',
    'https://example.com/b.xml.gz'
  ]);
});

test('parse robots sitemap directives', () => {
  const robots = 'User-agent: *\nSitemap: /sitemap.xml\nSitemap: https://cdn.example.com/news.xml';
  assert.deepEqual(parseRobotsForSitemaps(robots, 'https://example.com/robots.txt'), [
    'https://example.com/sitemap.xml',
    'https://cdn.example.com/news.xml'
  ]);
});

test('domain discovery includes robots and sitemap fallback', () => {
  const result = defaultDiscoveryUrls('example.com');
  assert.equal(result.robots, 'https://example.com/robots.txt');
  assert.deepEqual(result.direct, ['https://example.com/sitemap.xml']);
});

test('private IPs are blocked', async () => {
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/'), /not allowed/i);
});
