import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  APP_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_FAST_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_FAST_MODEL: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  ANTHROPIC_FAST_MODEL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_COMPANY_ID: z.string().optional(),
  TELEGRAM_BUSINESS_ENABLED: bool,
  SEND_MODE: z.string().optional(),
  DEMO_MODE: bool,
  DATA_RETENTION_DAYS: z.string().optional(),
});

export type Env = {
  isProd: boolean;
  appUrl: string;
  /** Raw value; use resolveSessionSecret() before sealing cookies. */
  sessionSecret: string;
  demoMode: boolean;
  sendMode: "copy" | "bot";
  retentionDays: number;
  llm: {
    /** LLM_PROVIDER=mock: offline, deterministic heuristics only. */
    forceMock: boolean;
    /** Primary OpenAI-compatible provider (Cerebras). */
    baseUrl?: string;
    apiKey?: string;
    model: string;
    fastModel: string;
    /** Fallback: Google Gemini through its OpenAI-compatible endpoint. */
    geminiKey?: string;
    geminiBaseUrl: string;
    geminiModel: string;
    geminiFastModel: string;
    /** Optional, first in the chain when a key is set. */
    anthropicKey?: string;
    anthropicModel: string;
    anthropicFastModel: string;
  };
  telegram: { token?: string; companyId?: string; businessEnabled: boolean };
  /** Config problems worth showing to the operator (never contains secret values). */
  warnings: string[];
};

const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/** Defaults chosen by `pnpm eval` (docs/EVAL.md); override with LLM_MODEL etc. */
export const DEFAULT_MODELS = {
  primary: "gpt-oss-120b",
  primaryFast: "llama3.1-8b",
  // 20 requests/day/model on the free tier → a failover list per role (11/11 model first).
  gemini: "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.7-flash,gemini-3.6-flash,gemini-3.8-flash",
  geminiFast: "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash",
};

/**
 * API keys are long printable ASCII. Anything else (e.g. a Cyrillic "ключ-…" left in .env) is a
 * placeholder: treating it as a key would only fail on every request (HTTP headers are ASCII).
 */
export function isPlausibleKey(v: string | undefined): v is string {
  return Boolean(v && v.length >= 20 && /^[\x21-\x7e]+$/.test(v) && !/^(change-me|your[-_ ]|x{6})/i.test(v));
}

export function isPlausibleBotToken(v: string | undefined): v is string {
  return Boolean(v && /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(v));
}

const DEV_SESSION_SECRET = "dev-only-session-secret-not-for-production-use-000";

/**
 * Secret for sealing session cookies. Only the web process needs it, so the check lives here
 * (the worker must start without it). Production refuses a missing/weak secret; development
 * falls back to a fixed local-only value.
 */
export function resolveSessionSecret(value: string, isProd: boolean): string {
  const weak = !value || value.startsWith("change-me") || value.length < 32;
  if (!weak) return value;
  if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET must be set to 32+ random characters in production");
  }
  return DEV_SESSION_SECRET;
}

function emptyToUndef(v: string | undefined): string | undefined {
  return v && v.trim() ? v.trim() : undefined;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const raw = schema.parse(source);
  const isProd = raw.NODE_ENV === "production";
  const warnings: string[] = [];
  const key = (name: string, value: string | undefined) => {
    const v = emptyToUndef(value);
    if (v && !isPlausibleKey(v)) {
      warnings.push(`${name} looks like a placeholder, not a real key — provider disabled`);
      return undefined;
    }
    return v;
  };
  const anthropicKey = key("ANTHROPIC_API_KEY", raw.ANTHROPIC_API_KEY);
  const baseUrl = emptyToUndef(raw.LLM_BASE_URL);
  const apiKey = key("LLM_API_KEY", raw.LLM_API_KEY);
  const geminiKey = key("GEMINI_API_KEY", raw.GEMINI_API_KEY);
  const rawToken = emptyToUndef(raw.TELEGRAM_BOT_TOKEN);
  const token = isPlausibleBotToken(rawToken) ? rawToken : undefined;
  if (rawToken && !token) {
    warnings.push("TELEGRAM_BOT_TOKEN looks like a placeholder, not a BotFather token — live Telegram disabled");
  }
  const model = emptyToUndef(raw.LLM_MODEL);
  const fastModel = emptyToUndef(raw.LLM_FAST_MODEL);
  // Older configs set LLM_MODEL to a Claude id for the Anthropic provider.
  const claude = (m: string | undefined) => (m && /^claude/i.test(m) ? m : undefined);

  const sessionSecret = emptyToUndef(raw.SESSION_SECRET) ?? "";
  const retention = Number(raw.DATA_RETENTION_DAYS ?? "90");
  return {
    isProd,
    appUrl: emptyToUndef(raw.APP_URL) ?? "http://localhost:3001",
    sessionSecret,
    demoMode: raw.DEMO_MODE,
    sendMode: raw.SEND_MODE === "bot" ? "bot" : "copy",
    retentionDays: Number.isFinite(retention) && retention > 0 ? retention : 90,
    llm: {
      forceMock: emptyToUndef(raw.LLM_PROVIDER) === "mock",
      baseUrl,
      apiKey,
      model: (model && !claude(model) ? model : undefined) ?? DEFAULT_MODELS.primary,
      fastModel: (fastModel && !claude(fastModel) ? fastModel : undefined) ?? DEFAULT_MODELS.primaryFast,
      geminiKey,
      geminiBaseUrl: emptyToUndef(raw.GEMINI_BASE_URL) ?? GEMINI_DEFAULT_BASE_URL,
      geminiModel: emptyToUndef(raw.GEMINI_MODEL) ?? DEFAULT_MODELS.gemini,
      geminiFastModel: emptyToUndef(raw.GEMINI_FAST_MODEL) ?? DEFAULT_MODELS.geminiFast,
      anthropicKey,
      anthropicModel: emptyToUndef(raw.ANTHROPIC_MODEL) ?? claude(model) ?? "claude-sonnet-5",
      anthropicFastModel:
        emptyToUndef(raw.ANTHROPIC_FAST_MODEL) ?? claude(fastModel) ?? "claude-haiku-4-5-20251001",
    },
    telegram: {
      token,
      companyId: emptyToUndef(raw.TELEGRAM_COMPANY_ID),
      businessEnabled: raw.TELEGRAM_BUSINESS_ENABLED,
    },
    warnings,
  };
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= readEnv();
  return cached;
}

/** Tests flip env vars between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
