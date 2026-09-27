// Provider chain, configured only from env: Cerebras (primary) → Gemini (fallback) → mock.
// Anthropic joins at the front only when ANTHROPIC_API_KEY is set. Every real provider here is
// called through its OpenAI-compatible endpoint except Anthropic (native SDK provider).
import { env, type Env } from "@/lib/env";

export type ProviderId = "cerebras" | "gemini" | "anthropic" | "openai" | "mock";

export type RateLimits = {
  /** Requests per minute. */
  rpm: number;
  /** Input + output tokens per minute. */
  tpm: number;
  /** Requests per day. */
  rpd: number;
};

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  kind: "openai-compatible" | "anthropic" | "mock";
  baseUrl?: string;
  apiKey?: string;
  /** First entries of `models` / `fastModels`. */
  model: string;
  fastModel: string;
  /** Tried in order before failing over to the next provider (separate quotas and load). */
  models: string[];
  fastModels: string[];
};

/** "a, b ,c" → ["a","b","c"]: model env vars accept a failover list. */
export function modelList(value: string): string[] {
  const list = value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function withModels(
  base: Omit<ProviderConfig, "model" | "fastModel" | "models" | "fastModels">,
  main: string,
  fast: string,
): ProviderConfig {
  const models = modelList(main);
  const fastModels = modelList(fast);
  return { ...base, model: models[0]!, fastModel: fastModels[0]!, models, fastModels };
}

const LABELS: Record<ProviderId, string> = {
  cerebras: "Cerebras",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  openai: "OpenAI-compatible",
  mock: "Mock (offline)",
};

export const MOCK_PROVIDER: ProviderConfig = {
  id: "mock",
  label: LABELS.mock,
  kind: "mock",
  model: "mock-heuristics",
  fastModel: "mock-heuristics",
  models: ["mock-heuristics"],
  fastModels: ["mock-heuristics"],
};

function primaryId(baseUrl: string): ProviderId {
  if (/cerebras\.ai/i.test(baseUrl)) return "cerebras";
  if (/generativelanguage\.googleapis\.com/i.test(baseUrl)) return "gemini";
  return "openai";
}

/** Real providers in failover order (mock not included). */
export function realProviders(e: Env["llm"] = env().llm): ProviderConfig[] {
  const chain: ProviderConfig[] = [];
  if (e.anthropicKey) {
    chain.push(
      withModels(
        { id: "anthropic", label: LABELS.anthropic, kind: "anthropic", apiKey: e.anthropicKey },
        e.anthropicModel,
        e.anthropicFastModel,
      ),
    );
  }
  if (e.baseUrl && e.apiKey) {
    const id = primaryId(e.baseUrl);
    chain.push(
      withModels(
        {
          id,
          label: LABELS[id],
          kind: "openai-compatible",
          baseUrl: e.baseUrl.replace(/\/+$/, ""),
          apiKey: e.apiKey,
        },
        e.model,
        e.fastModel,
      ),
    );
  }
  if (e.geminiKey && !chain.some((p) => p.id === "gemini")) {
    chain.push(
      withModels(
        {
          id: "gemini",
          label: LABELS.gemini,
          kind: "openai-compatible",
          baseUrl: e.geminiBaseUrl.replace(/\/+$/, ""),
          apiKey: e.geminiKey,
        },
        e.geminiModel,
        e.geminiFastModel,
      ),
    );
  }
  return chain;
}

/** Configured chain from env: real providers, then mock as the last resort. */
export function providerChain(e: Env["llm"] = env().llm): ProviderConfig[] {
  if (e.forceMock) return [MOCK_PROVIDER];
  return [...realProviders(e), MOCK_PROVIDER];
}

/**
 * Free-tier limits (conservative). Cerebras: 30 RPM / 60k TPM / 14.4k RPD per model.
 * Gemini's free tier is per model. Limit headers and 429 quota details tighten these at runtime
 * (see ratelimit.ts and classifyError).
 */
export function limitsFor(provider: ProviderId, model: string): RateLimits {
  switch (provider) {
    case "cerebras":
      return { rpm: 30, tpm: 60_000, rpd: 14_400 };
    case "gemini":
      // Observed 2026-09-27: every gemini-* model is capped at 20 requests/day/model on the
      // free tier ("GenerateRequestsPerDayPerProjectPerModel-FreeTier"); pro models get 0.
      if (/^gemma/i.test(model)) return { rpm: 30, tpm: 15_000, rpd: 14_400 };
      if (/pro/i.test(model)) return { rpm: 5, tpm: 250_000, rpd: 0 };
      if (/lite/i.test(model)) return { rpm: 15, tpm: 250_000, rpd: 20 };
      return { rpm: 10, tpm: 250_000, rpd: 20 };
    case "anthropic":
      return { rpm: 50, tpm: 400_000, rpd: 100_000 };
    case "openai":
      return { rpm: 20, tpm: 100_000, rpd: 5_000 };
    case "mock":
      return { rpm: 100_000, tpm: 1e12, rpd: 1e9 };
  }
}
