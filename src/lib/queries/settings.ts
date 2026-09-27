import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLog, companies, systemState, users } from "@/lib/db/schema";
import { providerInfo } from "@/lib/llm";
import { estimateCostUsd } from "@/lib/llm/pricing";
import { env } from "@/lib/env";
import { llmOverview } from "./llm-status";

/** Providers used on their free tier in this deployment: no spend. */
const FREE_TIER = new Set(["cerebras", "gemini", "mock"]);

export async function llmUsage(db: Db, companyId: string, days = 30) {
  const rows = await db.execute<{
    provider: string;
    model: string;
    task: string;
    calls: number;
    failed: number;
    input: number;
    output: number;
    latency: number;
  }>(sql`
    select provider, model, task, count(*)::int as calls, count(*) filter (where not ok)::int as failed,
      coalesce(sum(input_tokens),0)::int as input, coalesce(sum(output_tokens),0)::int as output,
      coalesce(avg(latency_ms),0)::int as latency
    from analysis_runs
    where company_id = ${companyId} and created_at > now() - (${days}::int * interval '1 day')
    group by 1,2,3 order by 1,2,3`);
  const items = rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    task: r.task,
    calls: Number(r.calls),
    failed: Number(r.failed),
    inputTokens: Number(r.input),
    outputTokens: Number(r.output),
    avgLatencyMs: Number(r.latency),
    costUsd: FREE_TIER.has(r.provider) ? 0 : estimateCostUsd(r.model, Number(r.input), Number(r.output)),
  }));
  return {
    items,
    totals: {
      calls: items.reduce((a, i) => a + i.calls, 0),
      inputTokens: items.reduce((a, i) => a + i.inputTokens, 0),
      outputTokens: items.reduce((a, i) => a + i.outputTokens, 0),
      costUsd: items.some((i) => i.costUsd === null)
        ? null
        : items.reduce((a, i) => a + (i.costUsd ?? 0), 0),
    },
  };
}

export async function systemStatus(db: Db) {
  const rows = await db.select().from(systemState);
  const get = (k: string) => rows.find((r) => r.key === k);
  const hb = get("worker_heartbeat");
  const bot = get("telegram_bot");
  const v = bot?.value ?? {};
  const lastPollAt = typeof v.lastPollAt === "string" ? v.lastPollAt : null;
  const lastUpdateAt = typeof v.lastUpdateAt === "string" ? v.lastUpdateAt : null;
  const workerAlive = hb ? Date.now() - hb.updatedAt.getTime() < 90_000 : false;
  return {
    workerLastSeen: hb?.updatedAt ?? null,
    workerAlive,
    telegram: {
      configured: Boolean(v.configured),
      /** TELEGRAM_BOT_TOKEN is set but is not a BotFather token. */
      placeholder: Boolean(v.placeholder),
      username: (v.username as string | undefined) ?? null,
      canReadAllGroupMessages: Boolean(v.canReadAllGroupMessages),
      businessEnabled: env().telegram.businessEnabled,
      /** A getUpdates round-trip succeeded within the last 90 s (long-poll timeout is 30 s). */
      online:
        Boolean(v.configured) &&
        workerAlive &&
        lastPollAt !== null &&
        Date.now() - new Date(lastPollAt).getTime() < 90_000,
      lastPollAt,
      lastUpdateAt,
      lastError: (v.lastError as string | null | undefined) ?? null,
    },
  };
}

export async function settingsData(db: Db, companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return null;
  return {
    company: { name: company.name, timezone: company.timezone, isDemo: company.isDemo },
    sla: company.sla,
    settings: company.settings,
    criteria: company.watchCriteria.items,
    llm: await providerInfo(),
    ai: await llmOverview(db, companyId),
    usage: await llmUsage(db, companyId),
    system: await systemStatus(db),
    envSendMode: env().sendMode,
  };
}

export async function auditEntries(db: Db, companyId: string, limit = 100) {
  const rows = await db
    .select({ a: auditLog, userName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.companyId, companyId))
    .orderBy(desc(auditLog.at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.a.id,
    at: r.a.at,
    user: r.userName,
    action: r.a.action,
    target: r.a.target,
    meta: r.a.meta,
  }));
}
