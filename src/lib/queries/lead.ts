import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { customers, signals, users } from "@/lib/db/schema";
import { editRateBy } from "./metrics";

export async function leadOverview(db: Db, companyId: string) {
  const staff = await db
    .select()
    .from(users)
    .where(
      and(eq(users.companyId, companyId), eq(users.role, "dispatcher"), eq(users.active, true)),
    )
    .orderBy(users.name);
  const custs = await db.select().from(customers).where(eq(customers.companyId, companyId));
  const open = await db
    .select()
    .from(signals)
    .where(and(eq(signals.companyId, companyId), eq(signals.status, "open")));
  const rates = await editRateBy(db, companyId, "decided_by");
  const firstResponse = await db.execute<{ user_id: string; minutes: number; n: number }>(sql`
    select coalesce(t.assignee_user_id, c.assigned_user_id) as user_id,
      avg(extract(epoch from (a.at - r.at)) / 60)::float as minutes, count(*)::int as n
    from tasks t
    join customers c on c.id = t.customer_id
    join task_events r on r.task_id = t.id and r.to_status = 'received'
    join task_events a on a.task_id = t.id and a.to_status = 'acknowledged'
    where t.company_id = ${companyId} and r.at > now() - interval '7 days'
    group by 1`);
  const toneWeek = await db.execute<{ user_id: string; n: number }>(sql`
    select responsible_user_id as user_id, count(*)::int as n from signals
    where company_id = ${companyId} and kind in ('rude_tone','context_ignored') and created_at > now() - interval '7 days'
    group by 1`);

  return staff.map((u) => {
    const mine = new Set(custs.filter((c) => c.assignedUserId === u.id).map((c) => c.id));
    const sig = open.filter(
      (s) => s.responsibleUserId === u.id || (s.customerId && mine.has(s.customerId)),
    );
    const fr = firstResponse.find((r) => r.user_id === u.id);
    return {
      userId: u.id,
      name: u.name,
      customers: custs.filter((c) => c.assignedUserId === u.id).map((c) => c.name),
      openUrgent: sig.filter((s) => s.severity >= 3).length,
      avgFirstResponseMin: fr ? Math.round(Number(fr.minutes)) : null,
      firstResponseSample: fr ? Number(fr.n) : 0,
      overdue: sig.filter((s) => s.kind === "overdue").length,
      toneFlags: Number(toneWeek.find((r) => r.user_id === u.id)?.n ?? 0),
      editRate: rates.get(u.id) ?? { approved: 0, edited: 0, rate: null },
      worstSeverity: sig.reduce((a, s) => Math.max(a, s.severity), 0),
    };
  });
}

export async function dispatcherProblems(db: Db, companyId: string, userId: string) {
  const mine = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.assignedUserId, userId)));
  const ids = mine.map((c) => c.id);
  const rows = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.companyId, companyId),
        eq(signals.status, "open"),
        ids.length
          ? or(eq(signals.responsibleUserId, userId), inArray(signals.customerId, ids))
          : eq(signals.responsibleUserId, userId),
      ),
    )
    .orderBy(desc(signals.severity), desc(signals.createdAt));
  const names = new Map(mine.map((c) => [c.id, c.name]));
  return rows.map((s) => ({
    id: s.id,
    kind: s.kind,
    severity: s.severity,
    title: s.title,
    reason: s.reason,
    evidenceQuote: s.evidenceQuote,
    customerId: s.customerId,
    customerName: s.customerId ? (names.get(s.customerId) ?? null) : null,
    taskId: s.taskId,
    channelId: s.channelId,
    createdAt: s.createdAt,
  }));
}
