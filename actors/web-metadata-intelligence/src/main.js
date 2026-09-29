import { Actor, log } from 'apify';
import { fetchPublicPage } from './fetch.js';
import { extractMetadata } from './parser.js';

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

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};
  const urls = [...new Set(
    (Array.isArray(input.urls) ? input.urls : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
  )];

  if (!urls.length) throw new Error('urls must contain at least one URL.');
  if (urls.length > 100) throw new Error('A maximum of 100 URLs is supported per run.');

  const timeoutSeconds = Number.isInteger(input.timeout_seconds)
    ? Math.min(60, Math.max(5, input.timeout_seconds))
    : 30;
  const concurrency = Number.isInteger(input.concurrency)
    ? Math.min(20, Math.max(1, input.concurrency))
    : 10;

  const pricingInfo = Actor.getChargingManager().getPricingInfo();

  const results = await mapLimit(urls, concurrency, async (url) => {
    try {
      const fetched = await fetchPublicPage(url, { timeoutSeconds });
      const result = {
        status: 'ready',
        url,
        final_url: fetched.finalUrl,
        fetched_at: new Date().toISOString(),
        http_status: fetched.httpStatus,
        content_type: fetched.contentType,
        response_bytes: fetched.bytes,
        latency_ms: fetched.durationMs,
        ...extractMetadata(fetched.body, fetched.finalUrl)
      };

      if (pricingInfo.isPayPerEvent) {
        const charge = await Actor.pushData(result, 'metadata-extraction');
        if (charge?.eventChargeLimitReached) {
          return { status: 'charge_limit_reached', url };
        }
      } else {
        await Actor.pushData(result);
      }

      return result;
    } catch (error) {
      const result = {
        status: 'error',
        url,
        error: error instanceof Error ? error.message : String(error),
        fetched_at: new Date().toISOString()
      };
      await Actor.pushData(result);
      return result;
    }
  });

  const summary = {
    status: 'ready',
    requested: urls.length,
    succeeded: results.filter((r) => r.status === 'ready').length,
    failed: results.filter((r) => r.status === 'error').length,
    charge_limit_reached: results.filter((r) => r.status === 'charge_limit_reached').length
  };

  await Actor.setValue('OUTPUT', { summary, results });
  log.info('Metadata extraction completed', summary);
});
