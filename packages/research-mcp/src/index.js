#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const SERVER_NAME = "industrial-platform-research-mcp";
const SERVER_VERSION = "0.1.2";

const ACTOR_ID = "industrial_platform~research-brief-agent";
const APIFY_API_BASE = "https://api.apify.com/v2";
const START_RUN_URL = `${APIFY_API_BASE}/actors/${ACTOR_ID}/runs`;

const HTTP_TIMEOUT_MS = 75000;
const MAX_RUN_WAIT_MS = 15 * 60 * 1000;

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED"
]);

const ResearchResultSchema = z
  .object({
    research_question: z.string(),
    research_date: z.string().optional(),
    brief: z.string().optional(),
    status: z.string(),

    qa: z
      .object({
        score: z.number().optional(),
        verdict: z.string().optional(),
        issues: z.array(z.string()).optional(),
        summary: z.string().optional(),
        revised: z.boolean().optional()
      })
      .passthrough()
      .optional(),

    research: z
      .object({
        evidence_count: z.number().optional(),
        unresolved_questions: z.array(z.string()).optional()
      })
      .passthrough()
      .optional(),

    usage: z
      .object({
        requests: z.number().optional(),
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        total_tokens: z.number().optional()
      })
      .passthrough()
      .optional(),

    message: z.string().optional()
  })
  .passthrough();

function cleanOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truncate(value, maxLength = 3000) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function errorResult(message) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };
}

async function requestApify(url, { token, method = "GET", body, timeoutMs = HTTP_TIMEOUT_MS }) {
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Apify request failed before completion: ${message}`);
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Apify returned HTTP ${response.status}.` +
        (responseText ? `\n\n${truncate(responseText)}` : "")
    );
  }

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(
      "Apify returned a successful HTTP response, but the response was not valid JSON."
    );
  }
}

async function runResearch(payload, token) {
  const started = await requestApify(START_RUN_URL, {
    token,
    method: "POST",
    body: payload,
    timeoutMs: 30000
  });

  let run = started?.data;

  if (!run?.id) {
    throw new Error("Apify accepted the request but did not return an Actor run ID.");
  }

  const runId = run.id;
  const waitStartedAt = Date.now();

  while (!TERMINAL_STATUSES.has(run.status)) {
    if (Date.now() - waitStartedAt > MAX_RUN_WAIT_MS) {
      throw new Error(
        `Industrial Platform run ${runId} is still running after 15 minutes. ` +
          "The run was started successfully, but this MCP request stopped waiting."
      );
    }

    const polled = await requestApify(
      `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`,
      {
        token,
        timeoutMs: 75000
      }
    );

    run = polled?.data;

    if (!run?.id) {
      throw new Error(
        `Apify returned an invalid status response for Actor run ${runId}.`
      );
    }
  }

  if (run.status !== "SUCCEEDED") {
    const detail =
      typeof run.statusMessage === "string" && run.statusMessage.trim()
        ? ` ${run.statusMessage.trim()}`
        : "";

    throw new Error(
      `Industrial Platform Actor run ${runId} ended with status ${run.status}.${detail}`
    );
  }

  const datasetId = run.defaultDatasetId;

  if (!datasetId) {
    throw new Error(
      `Industrial Platform Actor run ${runId} succeeded but returned no default dataset ID.`
    );
  }

  const data = await requestApify(
    `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    {
      token,
      timeoutMs: 30000
    }
  );

  return Array.isArray(data) ? data[0] : data;
}

function createServer() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "research_web",
    {
      title: "Industrial Platform Web Research",
      description:
        "Delegate current web research to Industrial Platform. " +
        "Use this tool for questions requiring current facts, source-backed " +
        "research, competitor or vendor analysis, pricing research, product " +
        "comparisons, market research, technology research, or fact verification. " +
        "The service gathers live web evidence, produces a cited research brief, " +
        "and performs automated quality review before returning the result.",

      inputSchema: z.object({
        research_question: z
          .string()
          .min(3)
          .describe(
            "The specific research question the service should investigate."
          ),

        context: z
          .string()
          .optional()
          .describe(
            "Optional background, decision context, audience information, " +
              "or other information that should shape the research."
          ),

        requirements: z
          .string()
          .optional()
          .describe(
            "Optional requirements such as source restrictions, comparison " +
              "criteria, output format, length, geography, or date constraints."
          )
      }),

      outputSchema: ResearchResultSchema
    },

    async ({ research_question, context, requirements }) => {
      const token = process.env.APIFY_TOKEN?.trim();

      if (!token) {
        return errorResult(
          "APIFY_TOKEN is not set. Set a valid Apify API token in the " +
            "environment before starting this MCP server."
        );
      }

      const payload = {
        research_question: research_question.trim()
      };

      const cleanContext = cleanOptionalString(context);
      const cleanRequirements = cleanOptionalString(requirements);

      if (cleanContext) {
        payload.context = cleanContext;
      }

      if (cleanRequirements) {
        payload.requirements = cleanRequirements;
      }

      let result;

      try {
        result = await runResearch(payload, token);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Industrial Platform request failed: ${message}`);
      }

      if (!result || typeof result !== "object") {
        return errorResult(
          "Industrial Platform completed the request but returned no research result."
        );
      }

      const status =
        typeof result.status === "string" ? result.status : "unknown";

      const textOutput =
        typeof result.brief === "string" && result.brief.trim().length > 0
          ? result.brief
          : JSON.stringify(result, null, 2);

      return {
        isError: status !== "ready",
        content: [
          {
            type: "text",
            text: textOutput
          }
        ],
        structuredContent: result
      };
    }
  );

  return server;
}

void serveStdio(createServer);

console.error(
  "Industrial Platform Research MCP server running on stdio."
);
