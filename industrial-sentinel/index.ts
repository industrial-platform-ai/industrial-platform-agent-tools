import { createHash } from "node:crypto";
import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

type JobKind =
  | "wallet-monitor"
  | "transaction-watch"
  | "treasury-snapshot"
  | "pretrade-context"
  | "market-snapshot"
  | "web-change"
  | "x402-adoption-search";

type JobConfig = {
  id: string;
  kind: JobKind;
  intervalSeconds: number;
  enabled?: boolean;
  input?: Record<string, unknown>;
  alertOnIncoming?: boolean;
  staleAfterSeconds?: number;
};

type SentinelConfig = {
  payerAdapterUrl: string;
  maxDailyUsd?: number;
  alertWebhookUrl?: string;
  alertOnEverySuccess?: boolean;
  jobs: JobConfig[];
};

const ROUTES: Record<JobKind, { path: string; priceUsd: number }> = {
  "wallet-monitor": { path: "/agent/wallet-monitor", priceUsd: 0.005 },
  "transaction-watch": { path: "/agent/transaction-watch", priceUsd: 0.003 },
  "treasury-snapshot": { path: "/agent/treasury-snapshot", priceUsd: 0.01 },
  "pretrade-context": { path: "/agent/pretrade", priceUsd: 0.01 },
  "market-snapshot": { path: "/crypto/snapshot", priceUsd: 0.008 },
  "web-change": { path: "/change", priceUsd: 0.001 },
  "x402-adoption-search": { path: "/x402/adoption-search", priceUsd: 0.001 },
};

type JobState = {
  lastRunAt?: string;
  lastOkAt?: string;
  lastStatus?: number;
  lastError?: string;
  lastResultHash?: string;
  lastAlertAt?: string;
  lastAlertEvent?: string;
  lastIncomingAt?: string;
  incomingTransferCount: number;
  incomingAmountRaw: bigint;
  runCount: number;
  paidUsdEstimate: number;
};

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function validateAdapterUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("payerAdapterUrl must be http or https");
  }
  return url;
}

function validateAlertUrl(raw?: string): URL | undefined {
  if (!raw) return undefined;
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("alertWebhookUrl must be https, except loopback http is allowed");
  }
  return url;
}

export default definePluginEntry({
  id: "industrial-sentinel",
  name: "Industrial Sentinel",
  description:
    "Install-once recurring monitoring workflows whose normal operation calls Industrial Platform every cycle.",

  register(api: any) {
    const cfg = api.pluginConfig as SentinelConfig;
    const adapterUrl = validateAdapterUrl(cfg.payerAdapterUrl);
    const jobs = (cfg.jobs || []).filter((job) => job.enabled !== false);
    const maxDailyUsd = Number(cfg.maxDailyUsd ?? 5);
    const alertWebhookUrl = validateAlertUrl(cfg.alertWebhookUrl);
    const alertOnEverySuccess = cfg.alertOnEverySuccess === true;

    const states = new Map<string, JobState>();
    const timers = new Map<string, ReturnType<typeof setInterval>>();
    let dayKey = utcDayKey();
    let dailyPaidUsdEstimate = 0;
    let running = false;
    let payerAddress: string | undefined;

    const getState = (id: string): JobState => {
      let state = states.get(id);
      if (!state) {
        state = { runCount: 0, paidUsdEstimate: 0, incomingTransferCount: 0, incomingAmountRaw: 0n };
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

    const sendAlert = async (
      event: string,
      job: JobConfig,
      state: JobState,
      details: Record<string, unknown> = {},
    ) => {
      if (!alertWebhookUrl) return;
      try {
        const response = await fetch(alertWebhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "industrial-sentinel",
            version: "0.4.0",
            event,
            observedAt: new Date().toISOString(),
            job: { id: job.id, kind: job.kind, intervalSeconds: job.intervalSeconds },
            spend: { dailyPaidUsdEstimate, maxDailyUsd, dayKey },
            ...details,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          api.logger.warn("Industrial Sentinel alert webhook HTTP " + response.status);
          return;
        }
        state.lastAlertAt = new Date().toISOString();
        state.lastAlertEvent = event;
      } catch (error) {
        api.logger.warn("Industrial Sentinel alert delivery failed: " + String((error as Error)?.message || error));
      }
    };

    const resolvePayerAddress = async (): Promise<string | undefined> => {
      if (payerAddress) return payerAddress;
      try {
        const healthUrl = new URL("/health", adapterUrl);
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) return undefined;
        const body = await response.json() as { payerAddress?: string | null };
        const candidate = String(body.payerAddress || "");
        if (/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
          payerAddress = candidate;
          return payerAddress;
        }
      } catch {}
      return undefined;
    };

    const materializeInput = async (job: JobConfig): Promise<Record<string, unknown>> => {
      const input = { ...(job.input || {}) };
      if ((job.kind === "wallet-monitor" || job.kind === "treasury-snapshot") && !input.address) {
        const address = await resolvePayerAddress();
        if (!address) throw new Error("No wallet address configured or exposed by payer adapter");
        input.address = address;
      }
      return input;
    };

    const applyNextRequest = (job: JobConfig, parsedResult: any) => {
      const request = parsedResult?.next_check?.request;
      if (request && typeof request === "object" && !Array.isArray(request)) {
        job.input = { ...(job.input || {}), ...request };
      }
    };

    const revenueSignals = async (job: JobConfig, state: JobState, parsedResult: any) => {
      if (job.kind !== "wallet-monitor") return;
      const transfers = Array.isArray(parsedResult?.activity?.transfers)
        ? parsedResult.activity.transfers
        : [];
      const incoming = transfers.filter((row: any) => String(row?.direction || "").toLowerCase() === "in");
      if (incoming.length) {
        const amountRaw = incoming.reduce((sum: bigint, row: any) => {
          try { return sum + BigInt(String(row?.amount_raw || "0")); } catch { return sum; }
        }, 0n);
        state.lastIncomingAt = new Date().toISOString();
        state.incomingTransferCount += incoming.length;
        state.incomingAmountRaw += amountRaw;
        if (job.alertOnIncoming !== false) {
          await sendAlert("incoming_payment", job, state, {
            incomingCount: incoming.length,
            incomingAmountRaw: amountRaw.toString(),
            transfers: incoming.slice(-20),
          });
        }
      }

      const staleAfter = Number(job.staleAfterSeconds || 0);
      if (staleAfter > 0) {
        const anchor = state.lastIncomingAt || state.lastOkAt;
        if (anchor) {
          const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(anchor)) / 1000));
          if (Number.isFinite(ageSeconds) && ageSeconds >= staleAfter && state.lastAlertEvent !== "revenue_stale") {
            await sendAlert("revenue_stale", job, state, {
              ageSeconds,
              staleAfterSeconds: staleAfter,
              lastIncomingAt: state.lastIncomingAt || null,
              message: "No incoming monitored payment observed within the configured revenue-staleness window.",
            });
          }
        }
      }
    };

    const runJob = async (job: JobConfig) => {
      resetDailyBudgetIfNeeded();
      const spec = ROUTES[job.kind];
      if (!spec) throw new Error("Unsupported Sentinel job kind: " + job.kind);

      if (dailyPaidUsdEstimate + spec.priceUsd > maxDailyUsd) {
        const state = getState(job.id);
        state.lastRunAt = new Date().toISOString();
        state.lastError = "Daily spend cap reached";
        if (state.lastAlertEvent !== "daily_spend_cap") {
          await sendAlert("daily_spend_cap", job, state, { message: state.lastError });
        }
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
            body: await materializeInput(job),
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

        let adapterResult: any = null;
        try { adapterResult = JSON.parse(text); } catch {}
        const resultBody = typeof adapterResult?.body === "string" ? adapterResult.body : text;
        let parsedResult: any = null;
        try { parsedResult = JSON.parse(resultBody); } catch {}
        applyNextRequest(job, parsedResult);
        const resultHash = createHash("sha256").update(resultBody).digest("hex");
        const previousHash = state.lastResultHash;

        state.lastOkAt = new Date().toISOString();
        state.lastError = undefined;
        state.lastResultHash = resultHash;
        state.paidUsdEstimate += spec.priceUsd;
        dailyPaidUsdEstimate += spec.priceUsd;
        await revenueSignals(job, state, parsedResult);

        const changed = Boolean(previousHash && previousHash !== resultHash);
        if (!previousHash) {
          await sendAlert("first_success", job, state, {
            changed: false,
            httpStatus: adapterResult?.httpStatus ?? response.status,
            result: resultBody.slice(0, 4000),
          });
        } else if (changed) {
          await sendAlert("state_changed", job, state, {
            changed: true,
            previousHash,
            currentHash: resultHash,
            httpStatus: adapterResult?.httpStatus ?? response.status,
            result: resultBody.slice(0, 4000),
          });
        } else if (alertOnEverySuccess) {
          await sendAlert("success", job, state, {
            changed: false,
            currentHash: resultHash,
            httpStatus: adapterResult?.httpStatus ?? response.status,
            result: resultBody.slice(0, 4000),
          });
        }
      } catch (error) {
        const previousError = state.lastError;
        state.lastError = String((error as Error)?.message || error);
        api.logger.warn("Industrial Sentinel job failed: " + job.id + " " + state.lastError);
        if (previousError !== state.lastError) {
          await sendAlert("job_error", job, state, { message: state.lastError });
        }
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
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              running,
              dayKey,
              dailyPaidUsdEstimate,
              maxDailyUsd,
              payerAddress,
              jobs: jobs.map((job) => {
                const state = getState(job.id);
                return { job, state: { ...state, incomingAmountRaw: state.incomingAmountRaw.toString() } };
              }),
            }),
          }],
          details: {
            running,
            dayKey,
            dailyPaidUsdEstimate,
            maxDailyUsd,
            payerAddress,
            jobs: jobs.map((job) => {
              const state = getState(job.id);
              return { job, state: { ...state, incomingAmountRaw: state.incomingAmountRaw.toString() } };
            }),
          },
        };
      },
    });

    api.registerTool({
      name: "industrial_sentinel_run_now",
      description: "Run one configured Industrial Sentinel job immediately.",
      parameters: Type.Object({ jobId: Type.String() }),
      async execute(_id: string, params: { jobId: string }) {
        const job = jobs.find((candidate) => candidate.id === params.jobId);
        if (!job) throw new Error("Unknown Sentinel job: " + params.jobId);
        await runJob(job);
        const state = getState(job.id);
        return {
          content: [{ type: "text", text: JSON.stringify({ jobId: job.id, state: { ...state, incomingAmountRaw: state.incomingAmountRaw.toString() } }) }],
          details: { jobId: job.id, state: { ...state, incomingAmountRaw: state.incomingAmountRaw.toString() } },
        };
      },
    });
  },
});
