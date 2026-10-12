import http from 'node:http';

// Read-only discovery/availability telemetry. Never submit x402 payments or sign requests.
const PORT = Number(process.env.PORT || 3000);
const TARGET = 'https://x402-gateway-production-1f21.up.railway.app';
const INTERVAL_MS = 300_000;
const TIMEOUT_MS = 12_000;
const MAX_HISTORY = 288; // 24 hours at one check per five minutes.
const PATHS = [
  '/health', '/.well-known/x402', '/pricing.json', '/openapi.json',
  '/agent.json', '/llms.txt', '/metrics/x402-24h.json'
];
const startedAt = new Date().toISOString();
const state = { startedAt, lastRun: null, runs: 0, results: [], history: [], running: false };

async function check() {
  if (state.running) return;
  state.running = true;
  const results = [];
  try {
    for (const path of PATHS) {
      const start = Date.now();
      try {
        const response = await fetch(TARGET + path, {
          method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
          headers: { 'User-Agent': 'IndustrialPlatform-Acquisition-Controller/1.1 (read-only; no purchases)' }
        });
        const body = await response.text();
        const item = { path, status: response.status, bytes: body.length,
          latencyMs: Date.now() - start };
        if (path === '/metrics/x402-24h.json' && response.ok) {
          try {
            const data = JSON.parse(body);
            item.metricFields = data && typeof data === 'object' && !Array.isArray(data)
              ? Object.keys(data).slice(0, 30) : [];
          } catch { item.metricParseError = true; }
        }
        results.push(item);
      } catch (error) {
        results.push({ path, error: String(error.message).slice(0, 160),
          latencyMs: Date.now() - start });
      }
    }
    state.lastRun = new Date().toISOString();
    state.runs += 1;
    state.results = results;
    state.history.push({ at: state.lastRun, results });
    if (state.history.length > MAX_HISTORY) state.history.shift();
    // Plain text ensures Railway's log UI does not swallow JSON as attributes.
    console.log(`ACQUISITION_READ_ONLY run=${state.runs} at=${state.lastRun} ` +
      results.map(x => `${x.path}:${x.status ?? 'ERR'}`).join(' '));
    const errors = results.filter(x => x.error || x.status >= 400 || x.metricParseError);
    if (errors.length) console.warn('DISCOVERY_CHECK_ISSUES ' +
      errors.map(x => `${x.path}=${x.status ?? x.error ?? 'invalid-json'}`).join(' '));
  } finally { state.running = false; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (path === '/health') return json(res, 200, {
    ok: true, mode: 'read-only', uptimeSeconds: Math.floor(process.uptime()),
    runs: state.runs, lastRun: state.lastRun
  });
  if (path === '/status') return json(res, 200, {
    mode: 'read-only', startedAt: state.startedAt, runs: state.runs,
    lastRun: state.lastRun, running: state.running, results: state.results,
    historySize: state.history.length,
    last24hChecks: state.history.length,
    last24hFailures: state.history.reduce((n, h) => n + h.results.filter(x => x.error || x.status >= 400).length, 0)
  });
  return json(res, 404, { error: 'not_found' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Acquisition controller started read-only port=${PORT} intervalSeconds=${INTERVAL_MS / 1000}`);
  void check();
  setInterval(() => void check(), INTERVAL_MS).unref();
});
