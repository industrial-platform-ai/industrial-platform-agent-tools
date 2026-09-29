#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const SERVER_NAME = "industrial-platform-research-mcp";
const SERVER_VERSION = "0.1.1";

const APIFY_API_URL =
  "https://api.apify.com/v2/actors/" +
  "industrial_platform~research-brief-agent/" +
  "run-sync-get-dataset-items?clean=true&format=json";

const REQUEST_TIMEOUT_MS = 330000;

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
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "APIFY_TOKEN is not set. Set a valid Apify API token in the " +
                "environment before starting this MCP server."
            }
          ]
        };
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

      let response;

      try {
        response = await fetch(APIFY_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Industrial Platform request failed before completion: ${message}`
            }
          ]
        };
      }

      const responseText = await response.text();

      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Industrial Platform returned HTTP ${response.status}.` +
                (responseText
                  ? `\n\n${truncate(responseText)}`
                  : "")
            }
          ]
        };
      }

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Industrial Platform returned a successful HTTP response, " +
                "but the response was not valid JSON."
            }
          ]
        };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result || typeof result !== "object") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Industrial Platform completed the request but returned no " +
                "research result."
            }
          ]
        };
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
