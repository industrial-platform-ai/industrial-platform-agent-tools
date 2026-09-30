import { Actor, log } from 'apify';
import { fetchRobots } from './fetch.js';
import { parseRobots, evaluateMatrix } from './robots.js';

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return output;
}

function uniqueStrings(values, fallback, max) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))].slice(0, max);
}

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};
  const sites = uniqueStrings(input.sites, [], 100);
  if (!sites.length) throw new Error('sites must contain at least one domain or URL.');

  const userAgents = uniqueStrings(input.user_agents, ['*'], 25);
  const testPaths = uniqueStrings(input.test_paths, ['/'], 100);
  const timeoutSeconds = Number.isInteger(input.timeout_seconds)
    ? Math.min(60, Math.max(5, input.timeout_seconds))
    : 20;
  const concurrency = Number.isInteger(input.concurrency)
    ? Math.min(20, Math.max(1, input.concurrency))
    : 10;

  const pricingInfo = Actor.getChargingManager().getPricingInfo();

  const results = await mapLimit(sites, concurrency, async (site) => {
    try {
      const fetched = await fetchRobots(site, { timeoutSeconds });
      const parsed = parseRobots(fetched.body);
      const result = {
        status: 'ready',
        site,
        origin: fetched.origin,
        robots_url: fetched.robotsUrl,
        robots_status: fetched.robotsStatus,
        http_status: fetched.httpStatus,
        fetched_at: new Date().toISOString(),
        response_bytes: fetched.bytes,
        latency_ms: fetched.durationMs,
        groups: parsed.groups,
        sitemaps: parsed.sitemaps,
        decisions: evaluateMatrix(parsed, userAgents, testPaths, fetched.origin)
      };

      if (pricingInfo.isPayPerEvent) {
        const charge = await Actor.pushData(result, 'robots-analysis');
        if (charge?.eventChargeLimitReached) return { status: 'charge_limit_reached', site };
      } else {
        await Actor.pushData(result);
      }
      return result;
    } catch (error) {
      const result = {
        status: 'error',
        site,
        error: error instanceof Error ? error.message : String(error),
        fetched_at: new Date().toISOString()
      };
      await Actor.pushData(result);
      return result;
    }
  });

  const summary = {
    status: 'ready',
    requested: sites.length,
    succeeded: results.filter((r) => r.status === 'ready').length,
    failed: results.filter((r) => r.status === 'error').length,
    charge_limit_reached: results.filter((r) => r.status === 'charge_limit_reached').length
  };

  await Actor.setValue('OUTPUT', { summary, results });
  log.info('Robots policy analysis completed', summary);
});
