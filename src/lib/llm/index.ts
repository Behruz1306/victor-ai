// The only door to language models. Every call: provider selection → structured output
// validated by zod → one repair attempt on schema failure → logged in analysis_runs.
// Never throws for model problems: returns null so the worker keeps running.
import { generateText, Output, NoObjectGeneratedError, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { z } from "zod";
import { env } from "@/lib/env";
import { analysisRuns } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type {
  AnalysisInput,
  CriteriaInput,
  DigestInput,
  DistillInput,
  HandoffInput,
  MappingInput,
} from "@/lib/pipeline/types";
import type {
  ChannelMapping,
  CustomerAnalysis,
  DistilledRule,
  HandoffOut,
  OwnerDigest,
  WatchCriteriaOut,
} from "./schemas";
import { mockCustomerAnalysis } from "./mock/analysis";
import {
  mockChannelMapping,
  mockDistillRule,
  mockHandoff,
  mockOwnerDigest,
  mockWatchCriteria,
} from "./mock/other";

export interface LlmTasks {
  customer_analysis: { input: AnalysisInput; output: CustomerAnalysis };
  owner_digest: { input: DigestInput; output: OwnerDigest };
  distill_rule: { input: DistillInput; output: DistilledRule };
  map_channel: { input: MappingInput; output: ChannelMapping };
  watch_criteria: { input: CriteriaInput; output: WatchCriteriaOut };
  handoff: { input: HandoffInput; output: HandoffOut };
}
export type LlmTask = keyof LlmTasks;

const MOCKS: { [K in LlmTask]: (input: LlmTasks[K]["input"]) => LlmTasks[K]["output"] } = {
  customer_analysis: mockCustomerAnalysis,
  owner_digest: mockOwnerDigest,
  distill_rule: mockDistillRule,
  map_channel: mockChannelMapping,
  watch_criteria: mockWatchCriteria,
  handoff: mockHandoff,
};

export type LogCtx = {
  db: Db;
  companyId: string;
  customerId?: string | null;
  channelId?: string | null;
};

export type StructuredOptions<K extends LlmTask> = {
  model: "main" | "fast";
  task: K;
  /** Structured context the mock provider reads instead of the prompt. */
  mockInput: LlmTasks[K]["input"];
  log?: LogCtx;
  maxOutputTokens?: number;
};

export function providerInfo() {
  const e = env().llm;
  return {
    provider: e.provider,
    model: e.provider === "mock" ? "mock-heuristics" : e.model,
    fastModel: e.provider === "mock" ? "mock-heuristics" : e.fastModel,
  };
}

function languageModel(kind: "main" | "fast"): LanguageModel {
  const e = env().llm;
  const id = kind === "main" ? e.model : e.fastModel;
  if (e.provider === "anthropic") return createAnthropic({ apiKey: e.anthropicKey })(id);
  return createOpenAICompatible({
    name: "llm",
    baseURL: e.baseUrl!,
    apiKey: e.apiKey,
    supportsStructuredOutputs: true,
  })(id);
}

async function logRun(
  log: LogCtx | undefined,
  row: {
    task: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    ok: boolean;
    error?: string;
  },
) {
  if (!log) return;
  try {
    await log.db.insert(analysisRuns).values({
      companyId: log.companyId,
      customerId: log.customerId ?? null,
      channelId: log.channelId ?? null,
      task: row.task,
      provider: row.provider,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      ok: row.ok,
      error: row.error?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("[llm] failed to log run", err instanceof Error ? err.message : err);
  }
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

export async function generateStructured<K extends LlmTask>(
  schema: z.ZodType<LlmTasks[K]["output"]>,
  prompt: { instructions: string; prompt: string },
  opts: StructuredOptions<K>,
): Promise<LlmTasks[K]["output"] | null> {
  const info = providerInfo();
  const started = Date.now();

  if (info.provider === "mock") {
    try {
      const out = schema.parse(MOCKS[opts.task](opts.mockInput));
      await logRun(opts.log, {
        task: opts.task,
        provider: "mock",
        model: "mock-heuristics",
        inputTokens: approxTokens(prompt.instructions + prompt.prompt),
        outputTokens: approxTokens(JSON.stringify(out)),
        latencyMs: Date.now() - started,
        ok: true,
      });
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logRun(opts.log, {
        task: opts.task,
        provider: "mock",
        model: "mock-heuristics",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        ok: false,
        error: message,
      });
      console.error(`[llm] mock ${opts.task} failed: ${message}`);
      return null;
    }
  }

  const modelId = opts.model === "main" ? info.model : info.fastModel;
  const model = languageModel(opts.model);
  let promptText = prompt.prompt;
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateText({
        model,
        instructions: prompt.instructions,
        prompt: promptText,
        output: Output.object({ schema }),
        maxRetries: 3,
        maxOutputTokens: opts.maxOutputTokens ?? 8000,
      });
      inputTokens += result.usage.inputTokens ?? 0;
      outputTokens += result.usage.outputTokens ?? 0;
      const parsed = schema.parse(result.output);
      await logRun(opts.log, {
        task: opts.task,
        provider: info.provider,
        model: modelId,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        ok: true,
      });
      return parsed;
    } catch (err) {
      const schemaFailure =
        NoObjectGeneratedError.isInstance(err) || (err instanceof Error && err.name === "ZodError");
      const message = err instanceof Error ? err.message : String(err);
      if (NoObjectGeneratedError.isInstance(err)) {
        inputTokens += err.usage?.inputTokens ?? 0;
        outputTokens += err.usage?.outputTokens ?? 0;
      }
      if (schemaFailure && attempt === 0) {
        // One repair attempt: tell the model what was wrong.
        promptText = `${prompt.prompt}\n\nYOUR PREVIOUS ANSWER DID NOT MATCH THE REQUIRED SCHEMA (${message.slice(0, 300)}). Answer again with valid JSON matching the schema exactly.`;
        continue;
      }
      await logRun(opts.log, {
        task: opts.task,
        provider: info.provider,
        model: modelId,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        ok: false,
        error: message,
      });
      console.error(`[llm] ${opts.task} failed: ${message.slice(0, 200)}`);
      return null;
    }
  }
  return null;
}
