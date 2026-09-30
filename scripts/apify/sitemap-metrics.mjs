const token = process.env.APIFY_TOKEN?.trim();
if (!token) throw new Error('APIFY_TOKEN is required.');

const actorId = 'industrial_platform~sitemap-intelligence';
const eventName = 'sitemap-url';
const base = 'https://api.apify.com/v2';

async function apify(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Apify HTTP ${response.status}: ${text.slice(0,1500)}`);
  return text ? JSON.parse(text) : null;
}

const actor = (await apify(`/actors/${encodeURIComponent(actorId)}`))?.data;
const runs = (await apify(`/actors/${encodeURIComponent(actorId)}/runs?status=SUCCEEDED&desc=1&limit=1000`))?.data?.items ?? [];

let externalPaidEvents = 0;
let externalPaidRuns = 0;
const externalUsers = new Set();

for (const run of runs) {
  const detail = (await apify(`/actor-runs/${encodeURIComponent(run.id)}`))?.data;
  if (!detail) continue;
  const count = Number(detail.chargedEventCounts?.[eventName] ?? 0);
  const isExternal = detail.userId && actor?.userId && detail.userId !== actor.userId;
  if (!isExternal || count <= 0) continue;
  externalPaidEvents += count;
  externalPaidRuns += 1;
  externalUsers.add(detail.userId);
}

const result = {
  external_paid_events: externalPaidEvents,
  external_paid_runs: externalPaidRuns,
  unique_external_users: externalUsers.size,
  measured_at: new Date().toISOString()
};

console.log(JSON.stringify(result, null, 2));

if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `external_paid_events=${result.external_paid_events}`,
    `external_paid_runs=${result.external_paid_runs}`,
    `unique_external_users=${result.unique_external_users}`
  ].join('\n') + '\n');
}
