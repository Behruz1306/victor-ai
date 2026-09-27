// The only door to language models. Every call: provider chain (Cerebras → Gemini → mock,
// Anthropic first when keyed) → shared rate limiter → structured output (strict JSON Schema, or
// JSON mode when a model rejects it) → lenient parse + zod → one repair attempt → failover on
// 429 / 5xx / timeouts / invalid output → every attempt logged in analysis_runs.
// Never throws for model problems: returns null (only possible without the mock fallback).
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APICallError, generateText, NoObjectGeneratedError, Output, type JSONValue } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { z } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import { analysisRuns } from "@/lib/db/schema";
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
import { MOCK_PROVIDER, limitsFor, providerChain, type ProviderConfig } from "./providers";
import { acquire, msUntilNextQuotaDay, settle } from "./ratelimit";
import { jsonModeInstructions, jsonSchemaFor, parseStructured, repairPrompt } from "./json";
import { cacheGet, cacheKey, cachePut } from "./cache";
import { getLlmMode } from "./mode";

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
  /** Serve/store identical prompts from the demo response cache (demo companies only). */
  cache?: boolean;
  /** How long to wait for a rate-limit slot before failing over (interactive calls wait less). */
  maxWaitMs?: number;
};

// ── Overrides (pnpm eval pins one model; tests pin the mock) ─────────────────────────────────
type Override = { chain: ProviderConfig[]; cache?: boolean };
const overrideStore = new AsyncLocalStorage<Override>();

export function withLlmOverride<T>(override: Override, fn: () => Promise<T>): Promise<T> {
  return overrideStore.run(override, fn);
}

/** Chain for the next call: eval override → offline switch → env chain. */
export async function activeChain(): Promise<ProviderConfig[]> {
  const o = overrideStore.getStore();
  if (o) return o.chain;
  const chain = providerChain();
  if (chain.length === 1) return chain;
  if ((await getLlmMode(getDb())) === "offline") return [MOCK_PROVIDER];
  return chain;
}

export async function providerInfo() {
  const chain = await activeChain();
  const first = chain[0]!;
  return {
    provider: first.id,
    label: first.label,
    model: first.model,
    fastModel: first.fastModel,
    offline: first.kind === "mock",
    chain: chain.map((p) => ({ id: p.id, label: p.label, model: p.model, fastModel: p.fastModel })),
  };
}

// ── Logging ────────────────────────────────────────────────────────────────────────────────
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
    cached?: boolean;
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
      cached: row.cached ?? false,
      error: row.error?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("[llm] failed to log run", err instanceof Error ? err.message : err);
  }
}

/** Conservative: Russian text tokenizes denser than English. */
const approxTokens = (s: string) => Math.ceil(s.length / 3.2);

// ── Provider calls ─────────────────────────────────────────────────────────────────────────
type CallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  headers: Record<string, string>;
};

type CallArgs = {
  instructions: string;
  prompt: string;
  mode: "json_schema" | "json_object";
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType;
  maxOutputTokens: number;
  timeoutMs: number;
};

/** Reasoning models think less for extraction work: faster and cheaper, same answers. */
function reasoningEffort(p: ProviderConfig, model: string): string | undefined {
  if (p.id === "gemini" && /^gemini/i.test(model)) return "low";
  if (/gpt-oss/i.test(model)) return "low";
  return undefined;
}

async function callOnce(p: ProviderConfig, model: string, a: CallArgs): Promise<CallResult> {
  const abortSignal = AbortSignal.timeout(a.timeoutMs);
  if (p.kind === "anthropic") {
    try {
      const result = await generateText({
        model: createAnthropic({ apiKey: p.apiKey })(model),
        instructions: a.instructions,
        prompt: a.prompt,
        output: Output.object({ schema: a.schema }),
        maxRetries: 0,
        maxOutputTokens: a.maxOutputTokens,
        abortSignal,
      });
      return {
        text: JSON.stringify(result.output),
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        headers: result.response.headers ?? {},
      };
    } catch (err) {
      // Let the lenient parser and the repair attempt handle near-miss JSON.
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        return {
          text: err.text,
          inputTokens: err.usage?.inputTokens ?? 0,
          outputTokens: err.usage?.outputTokens ?? 0,
          headers: {},
        };
      }
      throw err;
    }
  }
  const provider = createOpenAICompatible({
    name: p.id,
    baseURL: p.baseUrl!,
    apiKey: p.apiKey,
  });
  // JSON Schema is plain JSON; the SDK types provider options as JSONValue.
  const responseFormat = (
    a.mode === "json_schema"
      ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: a.jsonSchema } }
      : { type: "json_object" }
  ) as JSONValue;
  const effort = reasoningEffort(p, model);
  const result = await generateText({
    model: provider.chatModel(model),
    instructions: a.instructions,
    prompt: a.prompt,
    maxRetries: 0,
    maxOutputTokens: a.maxOutputTokens,
    temperature: 0.2,
    abortSignal,
    providerOptions: {
      [p.id]: { response_format: responseFormat, ...(effort ? { reasoningEffort: effort } : {}) },
    },
  });
  return {
    text: result.text,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    headers: result.response.headers ?? {},
  };
}

type Failure = {
  status: number;
  message: string;
  headers?: Record<string, string>;
  retryAfterMs?: number;
  schemaRejected: boolean;
};

/** Maps SDK / network errors to what the limiter and the failover logic need. */
export function classifyError(err: unknown, timeoutMs: number): Failure {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode ?? 0;
    const body = err.responseBody ?? "";
    const headers = err.responseHeaders ?? {};
    let retryAfterMs: number | undefined;
    const ra = headers["retry-after"];
    if (ra && Number.isFinite(Number(ra))) retryAfterMs = Number(ra) * 1000;
    const delay =
      /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(body);
    if (delay?.[1]) retryAfterMs = Math.ceil(Number(delay[1]) * 1000);
    // Gemini's free tier caps requests per model per day; its retryDelay then says "5s", which
    // would only burn more requests — wait for the quota day to roll over instead.
    const perDay = status === 429 && /PerDay/i.test(body);
    if (perDay) retryAfterMs = msUntilNextQuotaDay(new Date());
    const quota = /Quota exceeded for metric: ([^,]+), limit: (\d+)/.exec(body);
    const detail = quota
      ? `quota ${quota[1]!.split("/").pop()} limit ${quota[2]}${perDay ? " per day" : ""}`
      : (/"message"\s*:\s*"([^"]{0,200})/.exec(body)?.[1] ?? err.message).replace(/\\n/g, " ");
    return {
      status,
      message: `HTTP ${status}: ${detail}`,
      headers,
      retryAfterMs,
      schemaRejected:
        status === 400 &&
        /response_format|json_schema|schema|structured/i.test(`${body} ${err.message}`),
    };
  }
  const e = err as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return {
      status: 0,
      message: `timeout after ${Math.round(timeoutMs / 1000)} s`,
      schemaRejected: false,
    };
  }
  return { status: 0, message: e?.message ?? String(err), schemaRejected: false };
}

/**
 * LLM_RECORD_DIR=… saves each raw model output (text only — never keys or prompts) for test
 * fixtures and debugging.
 */
function recordOutput(task: string, provider: string, model: string, text: string) {
  const dir = process.env.LLM_RECORD_DIR;
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${task}.${provider}.${model}.${Date.now()}.txt`), text);
  } catch (err) {
    console.warn("[llm] could not record output:", err instanceof Error ? err.message : err);
  }
}

/** Models that rejected strict JSON Schema: use JSON mode for them from now on (per process). */
const jsonObjectModels = new Set<string>();

const DEFAULT_WAIT_MS = 20_000;

async function callProvider<T>(
  p: ProviderConfig,
  model: string,
  schema: z.ZodType<T>,
  prompt: { instructions: string; prompt: string },
  opts: StructuredOptions<LlmTask>,
  db: Db,
): Promise<{ ok: true; value: T } | { ok: false; error: string; fatal: boolean }> {
  const limitKey = `${p.id}:${model}`;
  const limits = limitsFor(p.id, model);
  const maxOut = opts.maxOutputTokens ?? 8000;
  const timeoutMs = opts.model === "main" ? 90_000 : 45_000;
  const jsonSchema = jsonSchemaFor(schema);
  const started = Date.now();
  let mode: CallArgs["mode"] = jsonObjectModels.has(limitKey) ? "json_object" : "json_schema";
  let promptText = prompt.prompt;
  let repaired = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let error = "";

  // Budget per provider: one mode switch (strict schema rejected → JSON mode), one repair, and
  // two retries for transient overload (5xx / timeout / short 429) before failing over.
  let transientRetries = 2;
  let fatal = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const instructions =
      mode === "json_object"
        ? `${prompt.instructions}\n\n${jsonModeInstructions(jsonSchema)}`
        : prompt.instructions;
    const est = approxTokens(instructions + promptText) + Math.min(maxOut, 3000);
    const slot = await acquire(db, limitKey, limits, est, opts.maxWaitMs ?? DEFAULT_WAIT_MS);
    if (!slot.ok) {
      error = `rate limit (${slot.reason}), next slot in ${Math.ceil(slot.waitMs / 1000)} s`;
      break;
    }
    try {
      const res = await callOnce(p, model, {
        instructions,
        prompt: promptText,
        mode,
        jsonSchema,
        schema,
        maxOutputTokens: maxOut,
        timeoutMs,
      });
      inputTokens += res.inputTokens;
      outputTokens += res.outputTokens;
      await settle(db, limitKey, {
        estTokens: est,
        actualTokens: res.inputTokens + res.outputTokens,
        status: 200,
        headers: res.headers,
      });
      recordOutput(opts.task, p.id, model, res.text);
      const parsed = parseStructured(res.text, schema);
      if (parsed.ok) {
        await logRun(opts.log, {
          task: opts.task,
          provider: p.id,
          model,
          inputTokens,
          outputTokens,
          latencyMs: Date.now() - started,
          ok: true,
        });
        return { ok: true, value: parsed.value };
      }
      error = parsed.error;
      if (repaired) break;
      repaired = true; // one repair attempt with the validation error
      promptText = repairPrompt(prompt.prompt, res.text, parsed.error);
    } catch (err) {
      const f = classifyError(err, timeoutMs);
      await settle(db, limitKey, {
        estTokens: est,
        status: f.status,
        headers: f.headers,
        retryAfterMs: f.retryAfterMs,
        error: f.message,
      });
      error = f.message;
      // Bad key: no other model of this provider will work either.
      fatal = f.status === 401 || f.status === 403;
      if (f.schemaRejected && mode === "json_schema") {
        mode = "json_object";
        jsonObjectModels.add(limitKey);
        continue;
      }
      // Overload / timeout / a 429 asking for a short pause: the limiter's cooldown spaces the
      // retry (acquire waits for it), so we never retry faster than the provider allows.
      const transient =
        f.status === 0 ||
        f.status >= 500 ||
        (f.status === 429 && (f.retryAfterMs ?? 60_000) <= (opts.maxWaitMs ?? DEFAULT_WAIT_MS));
      if (transient && transientRetries > 0) {
        transientRetries--;
        continue;
      }
      break;
    }
  }
  await logRun(opts.log, {
    task: opts.task,
    provider: p.id,
    model,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - started,
    ok: false,
    error,
  });
  console.warn(`[llm] ${p.id}/${model} ${opts.task} failed: ${error.slice(0, 200)}`);
  return { ok: false, error, fatal };
}

async function runMock<K extends LlmTask>(
  schema: z.ZodType<LlmTasks[K]["output"]>,
  prompt: { instructions: string; prompt: string },
  opts: StructuredOptions<K>,
  fallbackReason: string | null,
): Promise<LlmTasks[K]["output"] | null> {
  const started = Date.now();
  try {
    const out = schema.parse(MOCKS[opts.task](opts.mockInput));
    await logRun(opts.log, {
      task: opts.task,
      provider: "mock",
      model: MOCK_PROVIDER.model,
      inputTokens: approxTokens(prompt.instructions + prompt.prompt),
      outputTokens: approxTokens(JSON.stringify(out)),
      latencyMs: Date.now() - started,
      ok: true,
      error: fallbackReason ? `fallback: ${fallbackReason}` : undefined,
    });
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(opts.log, {
      task: opts.task,
      provider: "mock",
      model: MOCK_PROVIDER.model,
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

export async function generateStructured<K extends LlmTask>(
  schema: z.ZodType<LlmTasks[K]["output"]>,
  prompt: { instructions: string; prompt: string },
  opts: StructuredOptions<K>,
): Promise<LlmTasks[K]["output"] | null> {
  const override = overrideStore.getStore();
  const chain = await activeChain();
  const db = opts.log?.db ?? getDb();
  const real = chain.filter((p) => p.kind !== "mock");
  const useCache = (override ? override.cache : opts.cache) === true && real.length > 0;
  const key = useCache ? cacheKey(opts.task, prompt.instructions, prompt.prompt) : null;

  if (key) {
    const hit = await cacheGet(db, key).catch(() => null);
    const parsed = hit ? schema.safeParse(hit.output) : null;
    if (hit && parsed?.success) {
      await logRun(opts.log, {
        task: opts.task,
        provider: hit.provider,
        model: hit.model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        ok: true,
        cached: true,
      });
      return parsed.data;
    }
  }

  const failures: string[] = [];
  for (const p of chain) {
    if (p.kind === "mock") {
      return runMock(schema, prompt, opts, failures.length ? failures.join(" | ") : null);
    }
    for (const model of opts.model === "main" ? p.models : p.fastModels) {
      const r = await callProvider(p, model, schema, prompt, opts as StructuredOptions<LlmTask>, db);
      if (r.ok) {
        if (key) {
          await cachePut(db, { key, task: opts.task, provider: p.id, model, output: r.value }).catch(
            () => {},
          );
        }
        return r.value;
      }
      failures.push(`${p.id}/${model}: ${r.error}`);
      if (r.fatal) break;
    }
  }
  return null;
}
