import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, companies, digests, messages, participants, signals, tasks } from "@/lib/db/schema";
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
  const trend = await kpiTrend(db, companyId, window.from, now, { open: open.length, atRisk });
  return {
    openTasks: open.length,
    atRisk,
    avgAckMinutes: ack.minutes,
    ackSample: ack.count,
    requests24h: rows.length,
    window: { from: window.from.toISOString(), kind: window.kind },
    trend,
  };
}

const POINTS = 12;

/**
 * Sparklines and deltas from real history: open tasks (task events), tasks at risk (high/critical
 * signals open at each moment) and acknowledgment time per interval. Nothing is interpolated
 * except carrying the last ack value across empty intervals.
 */
export async function kpiTrend(
  db: Db,
  companyId: string,
  from: Date,
  now: Date,
  current: { open: number; atRisk: number },
) {
  const span = Math.max(now.getTime() - from.getTime(), 3_600_000);
  const at = (i: number) => new Date(from.getTime() + (span * (i + 1)) / POINTS);
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);

  const ev = await db.execute<{ task_id: string; to_status: string; at: Date }>(sql`
    select task_id, to_status, at from task_events
    where company_id = ${companyId} and to_status in ('received','delivered','cancelled')`);
  const opened = ev.filter((e) => e.to_status === "received").map((e) => new Date(e.at).getTime());
  const closed = ev.filter((e) => e.to_status !== "received").map((e) => new Date(e.at).getTime());
  const openAt = (t: Date) =>
    opened.filter((x) => x <= t.getTime()).length - closed.filter((x) => x <= t.getTime()).length;

  // Same definition as the tile: tasks with a high/critical signal open at that moment.
  const sig = await db
    .select({ taskId: signals.taskId, createdAt: signals.createdAt, resolvedAt: signals.resolvedAt })
    .from(signals)
    .where(and(eq(signals.companyId, companyId), gte(signals.severity, 4)));
  const riskAt = (t: Date) =>
    new Set(
      sig
        .filter((s) => s.taskId && s.createdAt <= t && (!s.resolvedAt || s.resolvedAt > t))
        .map((s) => s.taskId),
    ).size;

  const acks = await db.execute<{ received_at: Date; ack_at: Date | null }>(sql`
    select r.at as received_at,
      (select min(a.at) from task_events a where a.task_id = r.task_id and a.to_status = 'acknowledged') as ack_at
    from task_events r
    where r.company_id = ${companyId} and r.to_status = 'received'
      and r.at >= ${new Date(from.getTime() - span).toISOString()}`);
  const pairs = acks
    .filter((a) => a.ack_at)
    .map((a) => ({ r: new Date(a.received_at).getTime(), m: (new Date(a.ack_at!).getTime() - new Date(a.received_at).getTime()) / 60000 }));
  const avg = (lo: number, hi: number) => {
    const xs = pairs.filter((p) => p.r > lo && p.r <= hi).map((p) => p.m);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const ackSeries: number[] = [];
  let carry: number | null = null;
  let real = 0;
  for (let i = 0; i < POINTS; i++) {
    const v = avg(at(i - 1).getTime(), at(i).getTime());
    if (v !== null) {
      carry = v;
      real++;
    }
    if (carry !== null) ackSeries.push(Math.round(carry));
  }
  const ackNow = avg(from.getTime(), now.getTime());
  const ackPrev = avg(from.getTime() - span, from.getTime());

  return {
    points: POINTS,
    // The last point is the value on the tile.
    open: [...Array.from({ length: POINTS - 1 }, (_, i) => openAt(at(i))), current.open],
    risk: [...Array.from({ length: POINTS - 1 }, (_, i) => riskAt(at(i))), current.atRisk],
    ack: real >= 2 ? ackSeries : [],
    delta: {
      open: dayAgo > from ? current.open - openAt(dayAgo) : null,
      risk: dayAgo > from ? current.atRisk - riskAt(dayAgo) : null,
      ack: ackNow !== null && ackPrev !== null ? Math.round(ackNow - ackPrev) : null,
    },
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

type DigestEvidence = {
  sentAt: Date;
  chatTitle: string;
  chatType: string | null;
  sender: string | null;
};

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
  if (!latest) return { items: [] as (DigestItem & { evidence: DigestEvidence | null })[], generatedAt: null };
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
  const items = latest.items.filter((i) => open.has(i.signalId)).slice(0, 5);
  // Where the evidence was said: chat, sender, time.
  const ev = items.length
    ? await db
        .select({
          signalId: signals.id,
          sentAt: messages.sentAt,
          chatTitle: channels.title,
          chatType: channels.chatType,
          sender: participants.displayName,
        })
        .from(signals)
        .innerJoin(messages, eq(messages.id, signals.evidenceMessageId))
        .innerJoin(channels, eq(channels.id, messages.channelId))
        .leftJoin(participants, eq(participants.id, messages.participantId))
        .where(inArray(signals.id, items.map((i) => i.signalId)))
    : [];
  return {
    items: items.map((i) => {
      const e = ev.find((x) => x.signalId === i.signalId);
      return {
        ...i,
        evidence: e
          ? { sentAt: e.sentAt, chatTitle: e.chatTitle, chatType: e.chatType, sender: e.sender }
          : null,
      };
    }),
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
