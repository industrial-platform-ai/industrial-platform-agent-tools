// Post-quality-score optimization benchmark.
const cases = [
  ['web research', 'research-brief-agent'],
  ['website change detector', 'web-change-intelligence'],
  ['web metadata extractor', 'web-metadata-intelligence'],
  ['article content extractor', 'article-content-intelligence'],
  ['pdf text extractor', 'pdf-text-intelligence'],
  ['sitemap extractor', 'sitemap-intelligence'],
  ['link extractor', 'link-intelligence']
];

const rows = [];

for (const [query, expectedName] of cases) {
  const url = new URL('https://api.apify.com/v2/store');
  url.searchParams.set('search', query);
  url.searchParams.set('responseFormat', 'agent');
  url.searchParams.set('allowsAgenticUsers', 'true');
  url.searchParams.set('includeUnrunnableActors', 'true');
  url.searchParams.set('limit', '100');

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(query + ': HTTP ' + response.status + ' ' + text.slice(0, 1000));
  const body = JSON.parse(text);
  const items = body.data?.items ?? [];
  const index = items.findIndex((item) => item.username === 'industrial_platform' && item.name === expectedName);
  const actor = index >= 0 ? items[index] : null;
  rows.push({
    query,
    actor: 'industrial_platform/' + expectedName,
    rank: index >= 0 ? index + 1 : null,
    results_returned: items.length,
    indexed_title: actor?.title ?? null,
    indexed_description: actor?.description ?? null,
    total_users: actor?.stats?.totalUsers ?? null
  });
}

console.log(JSON.stringify({ benchmarked_at: new Date().toISOString(), rows }, null, 2));
