// Post-distribution optimization telemetry snapshot.
const token = process.env.APIFY_TOKEN?.trim();
if (!token) throw new Error('APIFY_TOKEN is required.');

const services = [
  ['web-change-intelligence', 'page-comparison'],
  ['web-metadata-intelligence', 'metadata-extraction'],
  ['article-content-intelligence', 'article-extraction'],
  ['pdf-text-intelligence', 'pdf-extraction'],
  ['sitemap-intelligence', 'sitemap-url'],
  ['link-intelligence', 'link-extraction']
];

const base = 'https://api.apify.com/v2';

async function apify(path) {
  const response = await fetch(base + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Apify HTTP ' + response.status + ': ' + body.slice(0, 1500));
  return body ? JSON.parse(body) : null;
}

const report = [];

for (const [name, eventName] of services) {
  const actorId = 'industrial_platform~' + name;
  const actor = (await apify('/actors/' + encodeURIComponent(actorId)))?.data;
  const runs = (await apify('/actors/' + encodeURIComponent(actorId) + '/runs?status=SUCCEEDED&desc=1&limit=1000'))?.data?.items ?? [];

  let externalPaidEvents = 0;
  let externalPaidRuns = 0;
  let grossExternalRevenueUsd = 0;
  const externalUsers = new Set();

  for (const run of runs) {
    const detail = (await apify('/actor-runs/' + encodeURIComponent(run.id)))?.data;
    if (!detail) continue;
    const count = Number(detail.chargedEventCounts?.[eventName] ?? 0);
    const external = detail.userId && actor?.userId && detail.userId !== actor.userId;
    if (!external || count <= 0) continue;

    externalPaidEvents += count;
    externalPaidRuns += 1;
    externalUsers.add(detail.userId);

    const event = detail.pricingInfo?.pricingPerEvent?.actorChargeEvents?.[eventName];
    if (typeof event?.eventPriceUsd === 'number') grossExternalRevenueUsd += count * event.eventPriceUsd;
  }

  report.push({
    actor: 'industrial_platform/' + name,
    event: eventName,
    external_paid_events: externalPaidEvents,
    external_paid_runs: externalPaidRuns,
    unique_external_users: externalUsers.size,
    gross_external_event_revenue_usd: Number(grossExternalRevenueUsd.toFixed(6))
  });
}

const totals = report.reduce((acc, row) => {
  acc.external_paid_events += row.external_paid_events;
  acc.external_paid_runs += row.external_paid_runs;
  acc.gross_external_event_revenue_usd += row.gross_external_event_revenue_usd;
  return acc;
}, { external_paid_events: 0, external_paid_runs: 0, gross_external_event_revenue_usd: 0 });

console.log(JSON.stringify({
  measured_at: new Date().toISOString(),
  services: report,
  totals: {
    ...totals,
    gross_external_event_revenue_usd: Number(totals.gross_external_event_revenue_usd.toFixed(6))
  }
}, null, 2));
