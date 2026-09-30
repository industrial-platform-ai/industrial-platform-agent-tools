import { Actor, log } from 'apify';
import { fetchPublicPdf } from './fetch.js';
import { extractPdf } from './pdf.js';

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

  if (!urls.length) throw new Error('urls must contain at least one PDF URL.');
  if (urls.length > 50) throw new Error('A maximum of 50 PDFs is supported per run.');

  const timeoutSeconds = Number.isInteger(input.timeout_seconds)
    ? Math.min(90, Math.max(5, input.timeout_seconds))
    : 45;
  const concurrency = Number.isInteger(input.concurrency)
    ? Math.min(10, Math.max(1, input.concurrency))
    : 5;
  const maxPages = Number.isInteger(input.max_pages)
    ? Math.min(500, Math.max(1, input.max_pages))
    : 200;
  const maxTextChars = Number.isInteger(input.max_text_chars)
    ? Math.min(1_000_000, Math.max(1000, input.max_text_chars))
    : 500_000;

  const pricingInfo = Actor.getChargingManager().getPricingInfo();

  const results = await mapLimit(urls, concurrency, async (url) => {
    try {
      const fetched = await fetchPublicPdf(url, { timeoutSeconds });
      const pdf = await extractPdf(fetched.buffer, { maxPages, maxTextChars });

      if (!pdf.text || pdf.text.length < 5) {
        const result = {
          status: 'error',
          url,
          final_url: fetched.finalUrl,
          error: 'No substantial extractable PDF text was detected.',
          fetched_at: new Date().toISOString()
        };
        await Actor.pushData(result);
        return result;
      }

      const result = {
        status: 'ready',
        url,
        final_url: fetched.finalUrl,
        fetched_at: new Date().toISOString(),
        http_status: fetched.httpStatus,
        content_type: fetched.contentType,
        response_bytes: fetched.bytes,
        latency_ms: fetched.durationMs,
        ...pdf
      };

      if (pricingInfo.isPayPerEvent) {
        const charge = await Actor.pushData(result, 'pdf-extraction');
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
  log.info('PDF extraction completed', summary);
});
