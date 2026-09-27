import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { companies, digests, messages, signals, tasks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { localParts, zonedToUtc } from "@/lib/time";
import { generateOwnerDigest } from "@/lib/pipeline/digest";
import type { DigestItem } from "@/lib/types";

/** Pure: average minutes from "received" to "acknowledged" for requests in the window. */
export function avgAckMinutes(pairs: { receivedAt: Date; ackAt: Date | null }[]): {
  minutes: number | null;
  count: number;
} {
  const done = pairs.filter((p) => p.ackAt);
  if (!done.length) return { minutes: null, count: 0 };
  const total = done.reduce((a, p) => a + (p.ackAt!.getTime() - p.receivedAt.getTime()) / 60000, 0);
  return { minutes: Math.round(total / done.length), count: done.length };
}

export async function ownerKpis(db: Db, companyId: string, now = new Date()) {
  const open = await db
    .select({ id: tasks.id, risk: tasks.risk })
    .from(tasks)
    .where(
      and(eq(tasks.companyId, companyId), notInArray(tasks.status, ["delivered", "cancelled"])),
    );
  const risky = await db
    .selectDistinct({ taskId: signals.taskId })
    .from(signals)
    .where(
      and(eq(signals.companyId, companyId), eq(signals.status, "open"), gte(signals.severity, 4)),
    );
  const riskySet = new Set(risky.map((r) => r.taskId).filter(Boolean));
  const atRisk = open.filter((t) => t.risk >= 2 || riskySet.has(t.id)).length;

  const window = await kpiWindow(db, companyId, now);
  const since = window.from;
  const rows = await db.execute<{ received_at: Date; ack_at: Date | null }>(sql`
    select r.at as received_at,
      (select min(a.at) from task_events a where a.task_id = r.task_id and a.to_status = 'acknowledged') as ack_at
    from task_events r
    where r.company_id = ${companyId} and r.to_status = 'received' and r.at >= ${since.toISOString()}`);
  const ack = avgAckMinutes(
    rows.map((r) => ({
      receivedAt: new Date(r.received_at),
      ackAt: r.ack_at ? new Date(r.ack_at) : null,
    })),
  );
  return {
    openTasks: open.length,
    atRisk,
    avgAckMinutes: ack.minutes,
    ackSample: ack.count,
    requests24h: rows.length,
    window: { from: window.from.toISOString(), kind: window.kind },
  };
}

/**
 * KPI window. Real companies: rolling 24 h. The demo company in DEMO_MODE: the whole scenario
 * (from the local start of the day of its first message), so the owner screen keeps its numbers
 * when the seeded "yesterday" is more than 24 h old.
 */
export async function kpiWindow(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<{ from: Date; kind: "rolling24h" | "demoScenario" }> {
  const rolling = { from: new Date(now.getTime() - 24 * 3_600_000), kind: "rolling24h" as const };
  if (!env().demoMode) return rolling;
  const [company] = await db
    .select({ isDemo: companies.isDemo, tz: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!company?.isDemo) return rolling;
  const [first] = await db
    .select({ at: sql<Date>`min(${messages.sentAt})` })
    .from(messages)
    .where(eq(messages.companyId, companyId));
  if (!first?.at) return rolling;
  const p = localParts(new Date(first.at), company.tz);
  const dayStart = zonedToUtc(p.y, p.m, p.d, 0, 0, company.tz);
  return dayStart < rolling.from ? { from: dayStart, kind: "demoScenario" } : rolling;
}

/** Latest owner digest, minus items whose signal is no longer open. Generates one if missing. */
export async function ownerDigest(db: Db, companyId: string) {
  let [latest] = await db
    .select()
    .from(digests)
    .where(and(eq(digests.companyId, companyId), eq(digests.audience, "owner")))
    .orderBy(desc(digests.generatedAt))
    .limit(1);
  if (!latest) {
    const [anyOpen] = await db
      .select({ id: signals.id })
      .from(signals)
      .where(
        and(
          eq(signals.companyId, companyId),
          eq(signals.status, "open"),
          eq(signals.audience, "owner"),
        ),
      )
      .limit(1);
    if (anyOpen) {
      await generateOwnerDigest(db, companyId);
      [latest] = await db
        .select()
        .from(digests)
        .where(and(eq(digests.companyId, companyId), eq(digests.audience, "owner")))
        .orderBy(desc(digests.generatedAt))
        .limit(1);
    }
  }
  if (!latest) return { items: [] as DigestItem[], generatedAt: null };
  const ids = latest.items.map((i) => i.signalId);
  const stillOpen = ids.length
    ? await db
        .select({ id: signals.id })
        .from(signals)
        .where(
          and(
            eq(signals.companyId, companyId),
            inArray(signals.id, ids),
            eq(signals.status, "open"),
          ),
        )
    : [];
  const open = new Set(stillOpen.map((s) => s.id));
  return {
    items: latest.items.filter((i) => open.has(i.signalId)).slice(0, 5),
    generatedAt: latest.generatedAt,
  };
}

export async function ownerOverview(db: Db, companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  return {
    kpis: await ownerKpis(db, companyId),
    digest: await ownerDigest(db, companyId),
    criteria: company?.watchCriteria.items ?? [],
    onboardingDone: company?.settings.onboardingDone ?? true,
    isDemo: company?.isDemo ?? false,
  };
}
