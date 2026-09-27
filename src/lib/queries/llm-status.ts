import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { analysisRuns } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { providerChain } from "@/lib/llm/providers";
import { getLlmMode } from "@/lib/llm/mode";
import { limiterRows, quotaDay } from "@/lib/llm/ratelimit";
import { limitsFor, type ProviderId } from "@/lib/llm/providers";

export type ProviderState = "ready" | "cooling_down" | "daily_limit" | "offline_mode";

/**
 * What Settings and the demo room show about AI: the chain, which provider answers right now,
 * requests today per provider (free-tier day, all processes) and this company's calls today.
 */
export async function llmOverview(db: Db, companyId: string, now = new Date()) {
  const mode = await getLlmMode(db);
  const chain = providerChain();
  const rows = await limiterRows(db);
  const today = quotaDay(now);
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const companyRuns = await db
    .select({
      provider: analysisRuns.provider,
      calls: sql<number>`count(*) filter (where not ${analysisRuns.cached})`.mapWith(Number),
      cached: sql<number>`count(*) filter (where ${analysisRuns.cached})`.mapWith(Number),
      failed: sql<number>`count(*) filter (where not ${analysisRuns.ok})`.mapWith(Number),
    })
    .from(analysisRuns)
    .where(and(eq(analysisRuns.companyId, companyId), gte(analysisRuns.createdAt, since)))
    .groupBy(analysisRuns.provider);

  const providers = chain.map((p) => {
    const keys = rows.filter((r) => r.key.startsWith(`${p.id}:`));
    const requestsToday = keys
      .filter((r) => String(r.day) === today)
      .reduce((a, r) => a + r.dayCount, 0);
    const cooldown = keys
      .map((r) => r.cooldownUntil)
      .filter((d): d is Date => Boolean(d && d > now))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const main = keys.find((r) => r.key === `${p.id}:${p.model}`);
    const limits = limitsFor(p.id as ProviderId, p.model);
    const dailyCapped = Boolean(main && String(main.day) === today && main.dayCount >= limits.rpd);
    const last = keys.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const state: ProviderState =
      p.kind === "mock"
        ? "ready"
        : mode === "offline"
          ? "offline_mode"
          : dailyCapped
            ? "daily_limit"
            : cooldown
              ? "cooling_down"
              : "ready";
    const runs = companyRuns.find((r) => r.provider === p.id);
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      models: p.models,
      fastModels: p.fastModels,
      state,
      cooldownUntil: cooldown?.toISOString() ?? null,
      requestsToday: p.kind === "mock" ? (runs?.calls ?? 0) : requestsToday,
      dailyLimit: p.kind === "mock" ? null : limits.rpd,
      companyCalls24h: runs?.calls ?? 0,
      cachedHits24h: runs?.cached ?? 0,
      failed24h: runs?.failed ?? 0,
      lastError: last?.lastStatus && last.lastStatus !== 200 ? last.lastError : null,
    };
  });
  // Cache hits are logged under the provider that produced the cached answer.
  const cachedHits24h = companyRuns.reduce((a, r) => a + r.cached, 0);
  const active =
    mode === "offline"
      ? providers.find((p) => p.kind === "mock")!
      : (providers.find((p) => p.state === "ready") ?? providers.at(-1)!);
  return {
    mode,
    forcedMock: env().llm.forceMock,
    warnings: env().warnings,
    active: {
      id: active.id,
      label: active.label,
      model: active.models[0]!,
      fastModel: active.fastModels[0]!,
    },
    providers,
    cachedHits24h,
  };
}
