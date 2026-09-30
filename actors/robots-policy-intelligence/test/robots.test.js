import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, evaluatePolicy } from '../src/robots.js';
import { isPublicIpAddress, normalizeSite, validatePublicUrl } from '../src/fetch.js';

const text = `
User-agent: *
Disallow: /private
Allow: /private/public
Crawl-delay: 5
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
Disallow: /
`;

test('parseRobots returns groups, rules, crawl delay, and sitemaps', () => {
  const parsed = parseRobots(text);
  assert.equal(parsed.groups.length, 2);
  assert.deepEqual(parsed.groups[0].user_agents, ['*']);
  assert.equal(parsed.groups[0].crawl_delay, 5);
  assert.deepEqual(parsed.sitemaps, ['https://example.com/sitemap.xml']);
});

test('specific user-agent group overrides wildcard group', () => {
  const parsed = parseRobots(text);
  const decision = evaluatePolicy(parsed, 'GPTBot/1.0', '/anything', 'https://example.com');
  assert.equal(decision.allowed, false);
  assert.equal(decision.group_specificity, 6);
});

test('longer allow rule wins over shorter disallow rule', () => {
  const parsed = parseRobots(text);
  assert.equal(evaluatePolicy(parsed, 'OtherBot', '/private/file', 'https://example.com').allowed, false);
  assert.equal(evaluatePolicy(parsed, 'OtherBot', '/private/public/file', 'https://example.com').allowed, true);
});

test('wildcards and end anchors are supported', () => {
  const parsed = parseRobots('User-agent: *\nDisallow: /*.pdf$\nAllow: /public/*.pdf$');
  assert.equal(evaluatePolicy(parsed, 'Bot', '/docs/a.pdf', 'https://example.com').allowed, false);
  assert.equal(evaluatePolicy(parsed, 'Bot', '/public/a.pdf', 'https://example.com').allowed, true);
  assert.equal(evaluatePolicy(parsed, 'Bot', '/docs/a.pdf?download=1', 'https://example.com').allowed, true);
});

test('normalization and IP protections work', async () => {
  assert.equal(normalizeSite('example.com/path'), 'https://example.com');
  assert.equal(isPublicIpAddress('127.0.0.1'), false);
  assert.equal(isPublicIpAddress('10.0.0.1'), false);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/robots.txt'), /not allowed/i);
});
