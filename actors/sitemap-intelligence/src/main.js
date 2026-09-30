import { Actor, log } from 'apify';
import { fetchPublicText } from './fetch.js';
import {
  defaultDiscoveryUrls,
  parseRobotsForSitemaps,
  parseSitemapDocument
} from './sitemap.js';

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};
  const starts = [...new Set(
    (Array.isArray(input.start_urls) ? input.start_urls : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
  )];

  if (!starts.length) throw new Error('start_urls must contain at least one domain or sitemap URL.');
  if (starts.length > 20) throw new Error('A maximum of 20 starting locations is supported per run.');

  const timeoutSeconds = Number.isInteger(input.timeout_seconds)
    ? Math.min(60, Math.max(5, input.timeout_seconds))
    : 30;
  const maxSitemaps = Number.isInteger(input.max_sitemaps)
    ? Math.min(500, Math.max(1, input.max_sitemaps))
    : 100;
  const maxUrls = Number.isInteger(input.max_urls)
    ? Math.min(100000, Math.max(1, input.max_urls))
    : 50000;

  const pricingInfo = Actor.getChargingManager().getPricingInfo();
  const sitemapQueue = [];
  const seenSitemaps = new Set();
  const seenUrls = new Set();

  for (const raw of starts) {
    const discovery = defaultDiscoveryUrls(raw);

    if (discovery.robots) {
      try {
        const robots = await fetchPublicText(discovery.robots, { timeoutSeconds });
        const discovered = parseRobotsForSitemaps(robots.text, robots.finalUrl);
        for (const sitemapUrl of discovered) {
          if (!seenSitemaps.has(sitemapUrl)) sitemapQueue.push(sitemapUrl);
        }
      } catch (error) {
        log.debug('robots.txt discovery failed', {
          start: raw,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    for (const sitemapUrl of discovery.direct) {
      if (!seenSitemaps.has(sitemapUrl)) sitemapQueue.push(sitemapUrl);
    }
  }

  let processedSitemaps = 0;
  let emittedUrls = 0;
  let stoppedByLimit = false;
  const errors = [];

  while (sitemapQueue.length && processedSitemaps < maxSitemaps && emittedUrls < maxUrls) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    try {
      const fetched = await fetchPublicText(sitemapUrl, { timeoutSeconds });
      processedSitemaps += 1;
      const parsed = parseSitemapDocument(fetched.text, fetched.finalUrl);

      for (const child of parsed.childSitemaps) {
        let absolute;
        try { absolute = new URL(child, fetched.finalUrl).href; }
        catch { continue; }
        if (!seenSitemaps.has(absolute) && sitemapQueue.length + seenSitemaps.size < maxSitemaps * 2) {
          sitemapQueue.push(absolute);
        }
      }

      for (const item of parsed.urls) {
        if (emittedUrls >= maxUrls) {
          stoppedByLimit = true;
          break;
        }

        let absolute;
        try { absolute = new URL(item.url, fetched.finalUrl).href; }
        catch { continue; }

        if (seenUrls.has(absolute)) continue;
        seenUrls.add(absolute);

        const row = {
          status: 'ready',
          url: absolute,
          lastmod: item.lastmod,
          changefreq: item.changefreq,
          priority: item.priority,
          source_sitemap: item.source_sitemap ?? fetched.finalUrl,
          discovered_at: new Date().toISOString()
        };

        if (pricingInfo.isPayPerEvent) {
          const charge = await Actor.pushData(row, 'sitemap-url');
          if (charge?.eventChargeLimitReached) {
            stoppedByLimit = true;
            break;
          }
        } else {
          await Actor.pushData(row);
        }

        emittedUrls += 1;
      }

      if (stoppedByLimit) break;
    } catch (error) {
      errors.push({
        sitemap_url: sitemapUrl,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (processedSitemaps >= maxSitemaps || emittedUrls >= maxUrls) stoppedByLimit = true;

  const summary = {
    status: 'ready',
    starts: starts.length,
    processed_sitemaps: processedSitemaps,
    emitted_urls: emittedUrls,
    unique_sitemaps_seen: seenSitemaps.size,
    errors,
    stopped_by_limit: stoppedByLimit,
    limits: {
      max_sitemaps: maxSitemaps,
      max_urls: maxUrls
    }
  };

  await Actor.setValue('OUTPUT', summary);
  log.info('Sitemap extraction completed', {
    processedSitemaps,
    emittedUrls,
    errors: errors.length,
    stoppedByLimit
  });
});
