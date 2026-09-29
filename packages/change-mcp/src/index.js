#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const SERVER_NAME = 'industrial-platform-change-mcp';
const SERVER_VERSION = '0.1.0';

const ACTOR_ID = 'industrial_platform~web-change-intelligence';
const APIFY_API_BASE = 'https://api.apify.com/v2';
const START_RUN_URL = `${APIFY_API_BASE}/actors/${ACTOR_ID}/runs`;

const HTTP_TIMEOUT_MS = 75_000;
const MAX_RUN_WAIT_MS = 5 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

const DiffSchema = z.object({
  added_chars: z.number().optional(),
  removed_chars: z.number().optional(),
  added_blocks: z.number().optional(),
  removed_blocks: z.number().optional(),
  change_ratio: z.number().optional(),
  added_excerpt: z.string().optional(),
  removed_excerpt: z.string().optional()
}).passthrough();

const ChangeResultSchema = z.object({
  status: z.string(),
  url: z.string(),
  final_url: z.string().optional(),
  checked_at: z.string().optional(),
  http_status: z.number().optional(),
  content_type: z.string().optional(),
  title: z.string().optional(),
  selector: z.string().optional(),
  comparison_mode: z.enum(['baseline', 'text', 'hash']),
  comparison_status: z.enum(['baseline', 'unchanged', 'changed']),
  changed: z.boolean().optional(),
  previous_hash: z.string().optional(),
  current_hash: z.string(),
  text_length: z.number().optional(),
  original_text_length: z.number().optional(),
  text_truncated: z.boolean().optional(),
  current_text: z.string().optional(),
  diff: DiffSchema.optional(),
  fetch: z.object({
    bytes_received: z.number().optional(),
    duration_ms: z.number().optional()
  }).passthrough().optional()
}).passthrough();

function cleanOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function truncate(value, maxLength = 3000) {
  if (typeof value !== 'string') return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }]
  };
}

async function requestApify(url, { token, method = 'GET', body, timeoutMs = HTTP_TIMEOUT_MS }) {
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(
      `Apify request failed before completion: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Apify returned HTTP ${response.status}.` +
        (responseText ? `\n\n${truncate(responseText)}` : '')
    );
  }

  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('Apify returned a successful response that was not valid JSON.');
  }
}

async function runChangeCheck(payload, token) {
  const started = await requestApify(START_RUN_URL, {
    token,
    method: 'POST',
    body: payload,
    timeoutMs: 30_000
  });

  let run = started?.data;
  if (!run?.id) {
    throw new Error('Apify accepted the request but did not return an Actor run ID.');
  }

  const runId = run.id;
  const waitStartedAt = Date.now();

  while (!TERMINAL_STATUSES.has(run.status)) {
    if (Date.now() - waitStartedAt > MAX_RUN_WAIT_MS) {
      throw new Error(
        `Industrial Platform run ${runId} is still running after 5 minutes. The run started successfully, but this MCP request stopped waiting.`
      );
    }

    const polled = await requestApify(
      `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`,
      { token, timeoutMs: 75_000 }
    );

    run = polled?.data;
    if (!run?.id) {
      throw new Error(`Apify returned an invalid status response for Actor run ${runId}.`);
    }
  }

  if (run.status !== 'SUCCEEDED') {
    const detail =
      typeof run.statusMessage === 'string' && run.statusMessage.trim()
        ? ` ${run.statusMessage.trim()}`
        : '';
    throw new Error(`Industrial Platform Actor run ${runId} ended with status ${run.status}.${detail}`);
  }

  if (!run.defaultDatasetId) {
    throw new Error(`Industrial Platform Actor run ${runId} succeeded but returned no dataset ID.`);
  }

  const data = await requestApify(
    `${APIFY_API_BASE}/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json`,
    { token, timeoutMs: 30_000 }
  );

  return Array.isArray(data) ? data[0] : data;
}

function summarizeResult(result) {
  if (result.comparison_status === 'baseline') {
    return `Baseline captured for ${result.final_url ?? result.url}. Current hash: ${result.current_hash}`;
  }

  if (result.comparison_status === 'unchanged') {
    return `No change detected for ${result.final_url ?? result.url}. Current hash: ${result.current_hash}`;
  }

  const ratio = typeof result.diff?.change_ratio === 'number'
    ? ` Change ratio: ${(result.diff.change_ratio * 100).toFixed(2)}%.`
    : '';
  return `Change detected for ${result.final_url ?? result.url}.${ratio}`;
}

function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'check_web_change',
    {
      title: 'Industrial Platform Web Change Intelligence',
      description:
        'Fetch a public web page or machine-readable endpoint, normalize its content, and compare it with a prior snapshot or SHA-256 hash. Use this for pricing changes, stock/availability changes, documentation changes, policy changes, competitor-page changes, or any workflow that needs deterministic changed/unchanged detection without an LLM.',
      inputSchema: z.object({
        url: z.string().url().describe('Public HTTP/HTTPS URL to inspect.'),
        previous_text: z.string().optional().describe('Optional current_text from a previous run. Enables detailed deterministic diff output.'),
        previous_hash: z.string().regex(/^[A-Fa-f0-9]{64}$/).optional().describe('Optional current_hash from a previous run for compact changed/unchanged checks.'),
        selector: z.string().optional().describe('Optional CSS selector that restricts HTML comparison to one region.'),
        ignore_selectors: z.array(z.string()).optional().describe('Optional CSS selectors to remove before comparison.'),
        include_current_text: z.boolean().optional().default(true).describe('Return normalized current_text so a later run can perform a detailed comparison.'),
        max_text_chars: z.number().int().min(1000).max(250000).optional().describe('Maximum normalized characters retained before hashing and comparison.'),
        max_diff_chars: z.number().int().min(1000).max(50000).optional().describe('Maximum characters returned in each added/removed diff excerpt.'),
        timeout_seconds: z.number().int().min(5).max(60).optional().describe('Maximum fetch time for the target URL.')
      }),
      outputSchema: ChangeResultSchema
    },
    async (args) => {
      const token = process.env.APIFY_TOKEN?.trim();
      if (!token) {
        return errorResult('APIFY_TOKEN is not set. Set a valid Apify API token before starting this MCP server.');
      }

      const payload = { url: args.url.trim() };
      for (const key of ['previous_text', 'previous_hash', 'selector']) {
        const value = cleanOptionalString(args[key]);
        if (value !== undefined) payload[key] = value;
      }

      if (Array.isArray(args.ignore_selectors) && args.ignore_selectors.length) {
        payload.ignore_selectors = args.ignore_selectors;
      }

      for (const key of ['include_current_text', 'max_text_chars', 'max_diff_chars', 'timeout_seconds']) {
        if (args[key] !== undefined) payload[key] = args[key];
      }

      let result;
      try {
        result = await runChangeCheck(payload, token);
      } catch (error) {
        return errorResult(
          `Industrial Platform change check failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (!result || typeof result !== 'object') {
        return errorResult('Industrial Platform completed the request but returned no comparison result.');
      }

      return {
        isError: result.status !== 'ready',
        content: [{ type: 'text', text: summarizeResult(result) }],
        structuredContent: result
      };
    }
  );

  return server;
}

void serveStdio(createServer);
console.error('Industrial Platform Change MCP server running on stdio.');
