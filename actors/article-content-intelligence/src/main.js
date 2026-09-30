import { Actor, log } from 'apify';
import { fetchPublicPage } from './fetch.js';
import { extractArticle } from './extract.js';

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
  const maxTextChars = Number.isInteger(input.max_text_chars)
    ? Math.min(200000, Math.max(1000, input.max_text_chars))
    : 100000;

  const pricingInfo = Actor.getChargingManager().getPricingInfo();

  const results = await mapLimit(urls, concurrency, async (url) => {
    try {
      const fetched = await fetchPublicPage(url, { timeoutSeconds });
      const article = extractArticle(fetched.body, fetched.finalUrl, { maxTextChars });

      if (!article.text || article.word_count < 20) {
        const result = {
          status: 'error',
          url,
          final_url: fetched.finalUrl,
          error: 'No substantial article content was detected.',
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
        ...article
      };

      if (pricingInfo.isPayPerEvent) {
        const charge = await Actor.pushData(result, 'article-extraction');
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
  log.info('Article extraction completed', summary);
});
