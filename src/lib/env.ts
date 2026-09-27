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
    provider: "anthropic" | "openai-compatible" | "mock";
    model: string;
    fastModel: string;
    anthropicKey?: string;
    baseUrl?: string;
    apiKey?: string;
  };
  telegram: { token?: string; companyId?: string; businessEnabled: boolean };
};

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
  const anthropicKey = emptyToUndef(raw.ANTHROPIC_API_KEY);
  const baseUrl = emptyToUndef(raw.LLM_BASE_URL);
  const apiKey = emptyToUndef(raw.LLM_API_KEY);
  const forced = emptyToUndef(raw.LLM_PROVIDER);

  let provider: Env["llm"]["provider"] = "mock";
  if (forced === "mock" || forced === "anthropic" || forced === "openai-compatible") {
    provider = forced;
  } else if (anthropicKey) provider = "anthropic";
  else if (baseUrl && apiKey) provider = "openai-compatible";
  // A forced real provider without credentials falls back to mock instead of crashing.
  if (provider === "anthropic" && !anthropicKey) provider = "mock";
  if (provider === "openai-compatible" && !(baseUrl && apiKey)) provider = "mock";

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
      provider,
      model: emptyToUndef(raw.LLM_MODEL) ?? "claude-sonnet-5",
      fastModel: emptyToUndef(raw.LLM_FAST_MODEL) ?? "claude-haiku-4-5-20251001",
      anthropicKey,
      baseUrl,
      apiKey,
    },
    telegram: {
      token: emptyToUndef(raw.TELEGRAM_BOT_TOKEN),
      companyId: emptyToUndef(raw.TELEGRAM_COMPANY_ID),
      businessEnabled: raw.TELEGRAM_BUSINESS_ENABLED,
    },
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
