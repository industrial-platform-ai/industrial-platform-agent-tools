import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const ROUTES = {
  "wallet-monitor": { path: "/agent/wallet-monitor", priceUsd: 0.005 },
  "transaction-watch": { path: "/agent/transaction-watch", priceUsd: 0.003 },
  "treasury-snapshot": { path: "/agent/treasury-snapshot", priceUsd: 0.01 },
  "pretrade-context": { path: "/agent/pretrade", priceUsd: 0.01 },
  "market-snapshot": { path: "/crypto/snapshot", priceUsd: 0.008 },
  "web-change": { path: "/change", priceUsd: 0.001 },
  "x402-adoption-search": { path: "/x402/adoption-search", priceUsd: 0.001 },
};

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function validateAdapterUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("payerAdapterUrl must be http or https");
  }
  return url;
}

export default definePluginEntry({
  id: "industrial-sentinel",
  name: "Industrial Sentinel",
  description:
    "Install-once recurring monitoring workflows whose normal operation calls Industrial Platform every cycle.",

  register(api) {
    const cfg = api.pluginConfig;
    const adapterUrl = validateAdapterUrl(cfg.payerAdapterUrl);
    const jobs = (cfg.jobs || []).filter((job) => job.enabled !== false);
    const maxDailyUsd = Number(cfg.maxDailyUsd ?? 5);

    const states = new Map();
    const timers = new Map();
    let dayKey = utcDayKey();
    let dailyPaidUsdEstimate = 0;
    let running = false;

    const getState = (id) => {
      let state = states.get(id);
      if (!state) {
        state = { runCount: 0, paidUsdEstimate: 0 };
        states.set(id, state);
      }
      return state;
    };

    const resetDailyBudgetIfNeeded = () => {
      const current = utcDayKey();
      if (current !== dayKey) {
        dayKey = current;
        dailyPaidUsdEstimate = 0;
      }
    };

    const runJob = async (job) => {
      resetDailyBudgetIfNeeded();
      const spec = ROUTES[job.kind];
      if (!spec) throw new Error("Unsupported Sentinel job kind: " + job.kind);

      if (dailyPaidUsdEstimate + spec.priceUsd > maxDailyUsd) {
        const state = getState(job.id);
        state.lastRunAt = new Date().toISOString();
        state.lastError = "Daily spend cap reached";
        return;
      }

      const state = getState(job.id);
      state.lastRunAt = new Date().toISOString();
      state.runCount += 1;

      try {
        const response = await fetch(adapterUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target: "https://x402-gateway-production-1f21.up.railway.app" + spec.path,
            method: "POST",
            body: job.input || {},
            maxUsd: spec.priceUsd,
            idempotencyKey: "industrial-sentinel:" + job.id + ":" + state.runCount
          }),
          signal: AbortSignal.timeout(20_000),
        });

        const text = await response.text();
        state.lastStatus = response.status;

        if (!response.ok) {
          throw new Error("payer adapter HTTP " + response.status + ": " + text.slice(0, 500));
        }

        state.lastOkAt = new Date().toISOString();
        state.lastError = undefined;
        state.paidUsdEstimate += spec.priceUsd;
        dailyPaidUsdEstimate += spec.priceUsd;
      } catch (error) {
        state.lastError = String(error?.message || error);
        api.logger.warn("Industrial Sentinel job failed: " + job.id + " " + state.lastError);
      }
    };

    const start = async () => {
      if (running) return;
      running = true;

      for (const job of jobs) {
        await runJob(job);
        const interval = setInterval(() => {
          void runJob(job);
        }, Math.max(15, Number(job.intervalSeconds || 60)) * 1000);
        interval.unref?.();
        timers.set(job.id, interval);
      }

      api.logger.info(
        "Industrial Sentinel started with " +
          jobs.length +
          " recurring jobs and $" +
          maxDailyUsd.toFixed(2) +
          "/day cap",
      );
    };

    const stop = async () => {
      running = false;
      for (const timer of timers.values()) clearInterval(timer);
      timers.clear();
    };

    api.on("gateway_start", start);
    api.registerService({
      id: "industrial-sentinel-recurring-jobs",
      start,
      stop,
    });

    api.registerTool({
      name: "industrial_sentinel_status",
      description: "Show Industrial Sentinel recurring-job status and current daily spend-cap usage.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              running,
              dayKey,
              dailyPaidUsdEstimate,
              maxDailyUsd,
              jobs: jobs.map((job) => ({ job, state: getState(job.id) })),
            }),
          }],
          details: {
            running,
            dayKey,
            dailyPaidUsdEstimate,
            maxDailyUsd,
            jobs: jobs.map((job) => ({ job, state: getState(job.id) })),
          },
        };
      },
    });

    api.registerTool({
      name: "industrial_sentinel_run_now",
      description: "Run one configured Industrial Sentinel job immediately.",
      parameters: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"], additionalProperties: false },
      async execute(_id, params) {
        const job = jobs.find((candidate) => candidate.id === params.jobId);
        if (!job) throw new Error("Unknown Sentinel job: " + params.jobId);
        await runJob(job);
        const state = getState(job.id);
        return {
          content: [{ type: "text", text: JSON.stringify({ jobId: job.id, state }) }],
          details: { jobId: job.id, state },
        };
      },
    });
  },
});
