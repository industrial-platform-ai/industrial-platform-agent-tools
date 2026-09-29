const token = process.env.APIFY_TOKEN?.trim();

if (!token) throw new Error('APIFY_TOKEN is required.');

const actorId = process.env.APIFY_ACTOR_ID || 'industrial_platform~web-change-intelligence';
const eventName = process.env.APIFY_EVENT_NAME || 'page-comparison';
const base = 'https://api.apify.com/v2';

async function apify(path) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Apify HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return output;
}

const actorResponse = await apify(`/actors/${encodeURIComponent(actorId)}`);
const actor = actorResponse?.data;
if (!actor?.userId) throw new Error('Could not determine Actor owner userId.');

const runsResponse = await apify(
  `/actors/${encodeURIComponent(actorId)}/runs?status=SUCCEEDED&desc=1&limit=1000`
);
const runs = runsResponse?.data?.items ?? [];

const details = await mapLimit(runs, 10, async (run) => {
  const response = await apify(`/actor-runs/${encodeURIComponent(run.id)}`);
  return response?.data;
});

let externalPaidEvents = 0;
let externalPaidRuns = 0;
let grossExternalEventRevenueUsd = 0;
const externalUsers = new Set();
const originCounts = {};

for (const run of details.filter(Boolean)) {
  const count = Number(run.chargedEventCounts?.[eventName] ?? 0);
  const isExternal = run.userId && run.userId !== actor.userId;
  if (!isExternal || count <= 0) continue;

  externalPaidEvents += count;
  externalPaidRuns += 1;
  externalUsers.add(run.userId);

  const origin = run.meta?.origin ?? 'UNKNOWN';
  originCounts[origin] = (originCounts[origin] ?? 0) + count;

  const eventInfo = run.pricingInfo?.pricingPerEvent?.actorChargeEvents?.[eventName];
  if (typeof eventInfo?.eventPriceUsd === 'number') {
    grossExternalEventRevenueUsd += eventInfo.eventPriceUsd * count;
  }
}

const metrics = {
  actor_id: actorId,
  event_name: eventName,
  inspected_successful_runs: runs.length,
  external_paid_events: externalPaidEvents,
  external_paid_runs: externalPaidRuns,
  unique_external_users: externalUsers.size,
  gross_external_event_revenue_usd: Number(grossExternalEventRevenueUsd.toFixed(6)),
  origin_event_counts: originCounts,
  measured_at: new Date().toISOString()
};

console.log(JSON.stringify(metrics, null, 2));

if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  const lines = [
    `external_paid_events=${metrics.external_paid_events}`,
    `external_paid_runs=${metrics.external_paid_runs}`,
    `unique_external_users=${metrics.unique_external_users}`,
    `gross_external_event_revenue_usd=${metrics.gross_external_event_revenue_usd}`,
    `metrics_json=${JSON.stringify(metrics)}`
  ];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}
