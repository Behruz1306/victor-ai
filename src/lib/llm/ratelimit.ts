// Token buckets per provider+model, stored in Postgres so the web process, the worker and
// `pnpm eval` share one free-tier budget. Two buckets (requests/min, tokens/min), a daily
// request counter and a cooldown set from 429s, 5xx and rate-limit headers.
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { llmLimits } from "@/lib/db/schema";
import type { RateLimits } from "./providers";

export type AcquireResult =
  { ok: true } | { ok: false; waitMs: number; reason: "cooldown" | "rpm" | "tpm" | "daily" };

type Row = typeof llmLimits.$inferSelect;

/** Free-tier days roll over at midnight Pacific (Google and Cerebras both reset on US time). */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

export function msUntilNextQuotaDay(now: Date): number {
  const day = quotaDay(now);
  let probe = now.getTime();
  // Walk forward in 15-minute steps until the Pacific date changes (DST-safe, ≤ 96 steps).
  while (quotaDay(new Date(probe)) === day) probe += 15 * 60_000;
  return probe - now.getTime();
}

/** Pure bucket math, exported for unit tests. */
export function evaluateBucket(
  row: Pick<
    Row,
    "requestTokens" | "tokenTokens" | "refilledAt" | "day" | "dayCount" | "cooldownUntil"
  >,
  limits: RateLimits,
  estTokens: number,
  now: Date,
): {
  result: AcquireResult;
  next: Pick<Row, "requestTokens" | "tokenTokens" | "refilledAt" | "day" | "dayCount">;
} {
  const elapsed = Math.max(0, now.getTime() - row.refilledAt.getTime());
  const reqCap = limits.rpm * 1000;
  let req = Math.min(reqCap, row.requestTokens + (elapsed * limits.rpm) / 60);
  let tok = Math.min(limits.tpm, row.tokenTokens + (elapsed * limits.tpm) / 60_000);
  const today = quotaDay(now);
  let dayCount = row.day === today ? row.dayCount : 0;
  const base = {
    requestTokens: Math.floor(req),
    tokenTokens: Math.floor(tok),
    refilledAt: now,
    day: today,
    dayCount,
  };

  if (row.cooldownUntil && row.cooldownUntil > now) {
    return {
      result: {
        ok: false,
        waitMs: row.cooldownUntil.getTime() - now.getTime(),
        reason: "cooldown",
      },
      next: base,
    };
  }
  if (dayCount >= limits.rpd) {
    return { result: { ok: false, waitMs: msUntilNextQuotaDay(now), reason: "daily" }, next: base };
  }
  if (req < 1000) {
    return {
      result: { ok: false, waitMs: Math.ceil(((1000 - req) * 60) / limits.rpm), reason: "rpm" },
      next: base,
    };
  }
  // A request bigger than the whole minute budget may go when the bucket is full.
  const need = Math.min(estTokens, limits.tpm);
  if (tok < need) {
    return {
      result: { ok: false, waitMs: Math.ceil(((need - tok) * 60_000) / limits.tpm), reason: "tpm" },
      next: base,
    };
  }
  req -= 1000;
  tok -= estTokens;
  dayCount += 1;
  return {
    result: { ok: true },
    next: {
      requestTokens: Math.floor(req),
      tokenTokens: Math.floor(tok),
      refilledAt: now,
      day: today,
      dayCount,
    },
  };
}

export async function tryAcquire(
  db: Db,
  key: string,
  limits: RateLimits,
  estTokens: number,
  now = new Date(),
): Promise<AcquireResult> {
  return db.transaction(async (tx) => {
    await tx
      .insert(llmLimits)
      .values({
        key,
        requestTokens: limits.rpm * 1000,
        tokenTokens: limits.tpm,
        refilledAt: now,
        day: quotaDay(now),
        dayCount: 0,
      })
      .onConflictDoNothing();
    const rows = await tx.execute<{
      request_tokens_milli: number;
      token_tokens: number;
      refilled_at: string | Date;
      day: string;
      day_count: number;
      cooldown_until: string | Date | null;
    }>(sql`select request_tokens_milli, token_tokens, refilled_at, day, day_count, cooldown_until
           from llm_limits where key = ${key} for update`);
    const r = rows[0]!;
    const { result, next } = evaluateBucket(
      {
        requestTokens: Number(r.request_tokens_milli),
        tokenTokens: Number(r.token_tokens),
        refilledAt: new Date(r.refilled_at),
        day: String(r.day).slice(0, 10),
        dayCount: Number(r.day_count),
        cooldownUntil: r.cooldown_until ? new Date(r.cooldown_until) : null,
      },
      limits,
      estTokens,
      now,
    );
    await tx
      .update(llmLimits)
      .set({ ...next, updatedAt: now })
      .where(eq(llmLimits.key, key));
    return result;
  });
}

/** Waits for a slot up to maxWaitMs. Returns false when the provider should be skipped. */
export async function acquire(
  db: Db,
  key: string,
  limits: RateLimits,
  estTokens: number,
  maxWaitMs: number,
): Promise<AcquireResult> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const r = await tryAcquire(db, key, limits, estTokens);
    if (r.ok) return r;
    if (Date.now() + r.waitMs > deadline) return r;
    await new Promise((res) => setTimeout(res, Math.max(250, r.waitMs)));
  }
}

export type SettleInfo = {
  estTokens: number;
  actualTokens?: number;
  status?: number;
  headers?: Record<string, string>;
  /** Server-requested backoff (Retry-After header or Gemini's retryDelay). */
  retryAfterMs?: number;
  error?: string;
};

const RATE_HEADER = /^(x-ratelimit-|retry-after)/i;

/** Cooldown implied by provider headers (Cerebras sends x-ratelimit-* on every response). */
export function cooldownFromHeaders(
  headers: Record<string, string>,
  estNext: number,
): number | null {
  const h = (k: string) => {
    const v = headers[k] ?? headers[k.toLowerCase()];
    return v === undefined ? null : Number(v);
  };
  const reqDay = h("x-ratelimit-remaining-requests-day");
  if (reqDay !== null && reqDay <= 0) return (h("x-ratelimit-reset-requests-day") ?? 3600) * 1000;
  const tokMin = h("x-ratelimit-remaining-tokens-minute");
  if (tokMin !== null && tokMin < estNext)
    return (h("x-ratelimit-reset-tokens-minute") ?? 60) * 1000;
  return null;
}

export async function settle(
  db: Db,
  key: string,
  info: SettleInfo,
  now = new Date(),
): Promise<void> {
  const headers = Object.fromEntries(
    Object.entries(info.headers ?? {}).filter(([k]) => RATE_HEADER.test(k)),
  );
  let cooldownMs: number | null = null;
  if (info.status === 429) cooldownMs = info.retryAfterMs ?? 60_000;
  else if (info.status === 401 || info.status === 403) cooldownMs = 10 * 60_000;
  else if (info.status === 404) cooldownMs = 10 * 60_000;
  else if (info.status && info.status >= 500) cooldownMs = info.retryAfterMs ?? 6_000;
  else if (info.status === 0) cooldownMs = 5_000; // timeout / network
  const fromHeaders = Object.keys(headers).length
    ? cooldownFromHeaders(headers, info.estTokens)
    : null;
  if (fromHeaders !== null) cooldownMs = Math.max(cooldownMs ?? 0, fromHeaders);
  const correction = info.actualTokens !== undefined ? info.estTokens - info.actualTokens : 0;
  await db
    .update(llmLimits)
    .set({
      tokenTokens: sql`${llmLimits.tokenTokens} + ${Math.round(correction)}`,
      cooldownUntil: cooldownMs
        ? new Date(now.getTime() + cooldownMs)
        : sql`${llmLimits.cooldownUntil}`,
      lastStatus: info.status ?? null,
      lastError: info.error?.slice(0, 300) ?? null,
      lastHeaders: Object.keys(headers).length ? headers : sql`${llmLimits.lastHeaders}`,
      updatedAt: now,
    })
    .where(eq(llmLimits.key, key));
}

export async function limiterRows(db: Db): Promise<Row[]> {
  return db.select().from(llmLimits);
}

/** Clears cooldowns (demo control room "retry providers now"). */
export async function clearCooldowns(db: Db): Promise<void> {
  await db.update(llmLimits).set({ cooldownUntil: null });
}
