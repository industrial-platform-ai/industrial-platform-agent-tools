import { Actor, log } from 'apify';
import {
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MAX_TEXT_CHARS,
  HARD_MAX_DIFF_CHARS,
  HARD_MAX_TEXT_CHARS,
  compareText,
  extractNormalizedContent,
  fetchPublicText,
  hashContent,
  validateComparisonInput
} from './lib.js';

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};

  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!url) {
    throw new Error('url is required.');
  }

  const previousText =
    typeof input.previous_text === 'string' ? input.previous_text : undefined;
  const previousHash =
    typeof input.previous_hash === 'string' && input.previous_hash.trim()
      ? input.previous_hash.trim().toLowerCase()
      : undefined;
  const selector =
    typeof input.selector === 'string' && input.selector.trim()
      ? input.selector.trim()
      : undefined;
  const ignoreSelectors = Array.isArray(input.ignore_selectors)
    ? input.ignore_selectors
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    : [];

  const includeCurrentText = input.include_current_text !== false;
  const maxTextChars = clampInteger(
    input.max_text_chars,
    DEFAULT_MAX_TEXT_CHARS,
    1_000,
    HARD_MAX_TEXT_CHARS
  );
  const maxDiffChars = clampInteger(
    input.max_diff_chars,
    DEFAULT_MAX_DIFF_CHARS,
    1_000,
    HARD_MAX_DIFF_CHARS
  );
  const timeoutSeconds = clampInteger(input.timeout_seconds, 30, 5, 60);

  validateComparisonInput({ previousText, previousHash });

  log.info('Fetching target', { url, selector, maxTextChars });

  const fetched = await fetchPublicText(url, { timeoutSeconds });
  const extracted = extractNormalizedContent({
    body: fetched.body,
    contentType: fetched.contentType,
    selector,
    ignoreSelectors,
    maxTextChars
  });

  const currentHash = hashContent(extracted.text);

  let comparisonMode = 'baseline';
  let comparisonStatus = 'baseline';
  let changed;
  let diff;

  if (previousText !== undefined) {
    comparisonMode = 'text';
    changed = previousText !== extracted.text;
    comparisonStatus = changed ? 'changed' : 'unchanged';
    if (changed) {
      diff = compareText(previousText, extracted.text, maxDiffChars);
    }
  } else if (previousHash) {
    comparisonMode = 'hash';
    changed = previousHash !== currentHash;
    comparisonStatus = changed ? 'changed' : 'unchanged';
  }

  const result = {
    status: 'ready',
    url,
    final_url: fetched.finalUrl,
    checked_at: new Date().toISOString(),
    http_status: fetched.httpStatus,
    content_type: fetched.contentType || undefined,
    title: extracted.title,
    selector,
    ignore_selectors: ignoreSelectors.length ? ignoreSelectors : undefined,
    comparison_mode: comparisonMode,
    comparison_status: comparisonStatus,
    ...(changed === undefined ? {} : { changed }),
    previous_hash: previousHash,
    current_hash: currentHash,
    text_length: extracted.text.length,
    original_text_length: extracted.originalTextLength,
    text_truncated: extracted.textTruncated,
    current_text: includeCurrentText ? extracted.text : undefined,
    diff,
    fetch: {
      bytes_received: fetched.bytes,
      duration_ms: fetched.durationMs
    }
  };

  const cleanResult = JSON.parse(JSON.stringify(result));

  const pricingInfo = Actor.getChargingManager().getPricingInfo();
  if (pricingInfo.isPayPerEvent) {
    const chargeResult = await Actor.pushData(cleanResult, 'page-comparison');
    if (chargeResult?.eventChargeLimitReached) {
      log.warning('Charge limit reached before result could be returned.');
      return;
    }
  } else {
    await Actor.pushData(cleanResult);
  }

  await Actor.setValue('OUTPUT', cleanResult);
  log.info('Comparison completed', {
    comparisonStatus,
    comparisonMode,
    currentHash,
    textLength: extracted.text.length
  });
});
