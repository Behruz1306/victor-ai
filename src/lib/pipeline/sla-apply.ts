import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  customers,
  messages,
  participants,
  signals,
  taskEvents,
  tasks,
} from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { evaluateSla, type SlaChannel, type SlaTask } from "./sla";
import { routeAudience } from "./audience";
import { upsertSignal } from "./signals-store";
import { isClosingRemark } from "@/lib/heuristics/extract";

const AI_QUALITY_TTL_HOURS = 72;

export async function runSla(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<{ opened: number; resolved: number }> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return { opened: 0, resolved: 0 };

  const custRows = await db.select().from(customers).where(eq(customers.companyId, companyId));
  const custById = new Map(custRows.map((c) => [c.id, c]));

  const openTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, companyId),
        inArray(tasks.status, ["received", "acknowledged", "in_progress", "deadline_set"]),
      ),
    );
  const ids = openTasks.map((t) => t.id);
  const events = ids.length
    ? await db
        .select({ e: taskEvents, text: messages.text })
        .from(taskEvents)
        .leftJoin(messages, eq(messages.id, taskEvents.evidenceMessageId))
        .where(inArray(taskEvents.taskId, ids))
        .orderBy(taskEvents.at)
    : [];
  const openAi = await db
    .select()
    .from(signals)
    .where(
      and(eq(signals.companyId, companyId), eq(signals.status, "open"), eq(signals.source, "ai")),
    );
  const etaFlagged = new Set(
    openAi.filter((s) => s.kind === "eta_not_forwarded" && s.taskId).map((s) => s.taskId!),
  );

  const slaTasks: SlaTask[] = openTasks.map((t) => {
    const ev = events.filter((x) => x.e.taskId === t.id);
    const received = ev.find((x) => x.e.toStatus === "received");
    const ack = ev.find((x) => x.e.toStatus === "acknowledged");
    const cust = custById.get(t.customerId);
    return {
      id: t.id,
      customerId: t.customerId,
      customerName: cust?.name ?? "",
      channelId: t.channelId,
      kind: t.kind,
      status: t.status,
      title: t.title,
      requestedAt: received?.e.at ?? t.createdAt,
      requestQuote: received?.text ?? null,
      requestMessageId: t.createdFromMessageId,
      ackAt: ack?.e.at ?? null,
      ackQuote: ack?.text ?? null,
      lastEventAt: t.lastEventAt,
      deadlineAt: t.deadlineAt,
      responsibleUserId: t.assigneeUserId ?? cust?.assignedUserId ?? null,
      hasEtaNotForwarded: etaFlagged.has(t.id),
    };
  });

  // Last message per mapped customer-facing channel.
  const chanRows = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.companyId, companyId),
        eq(channels.active, true),
        isNotNull(channels.customerId),
        isNotNull(channels.chatType),
      ),
    );
  const slaChannels: SlaChannel[] = [];
  for (const c of chanRows) {
    if (!["customer", "billing", "support"].includes(c.chatType!)) continue;
    const [last] = await db
      .select({ m: messages, side: participants.side })
      .from(messages)
      .leftJoin(participants, eq(participants.id, messages.participantId))
      .where(eq(messages.channelId, c.id))
      .orderBy(desc(messages.sentAt))
      .limit(1);
    const createdTask = last
      ? openTasks.find((t) => t.createdFromMessageId === last.m.id)
      : undefined;
    const cust = custById.get(c.customerId!);
    slaChannels.push({
      id: c.id,
      customerId: c.customerId!,
      customerName: cust?.name ?? "",
      chatType: c.chatType!,
      title: c.title,
      responsibleUserId: cust?.assignedUserId ?? null,
      lastMessage: last
        ? {
            id: last.m.id,
            side: last.side ?? "unknown",
            sentAt: last.m.sentAt,
            text: last.m.text,
            createdTaskStatus: createdTask?.status ?? null,
            closing: isClosingRemark(last.m.text),
          }
        : null,
    });
  }

  const lastCustomerMsg = await db.execute<{ customer_id: string; last_at: Date; n: number }>(sql`
    select c.customer_id, max(m.sent_at) as last_at, count(*)::int as n
    from messages m join channels c on c.id = m.channel_id
    join participants p on p.id = m.participant_id
    where m.company_id = ${companyId} and c.customer_id is not null and p.side = 'customer'
    group by c.customer_id`);
  const slaCustomers = custRows.map((c) => {
    const row = lastCustomerMsg.find((r) => r.customer_id === c.id);
    return {
      id: c.id,
      name: c.name,
      responsibleUserId: c.assignedUserId,
      lastCustomerMessageAt: row ? new Date(row.last_at) : null,
      messageCount: row ? Number(row.n) : 0,
    };
  });

  const { signals: desired, patches } = evaluateSla({
    now,
    timezone: company.timezone,
    sla: company.sla,
    tasks: slaTasks,
    channels: slaChannels,
    customers: slaCustomers,
  });

  let opened = 0;
  for (const d of desired) {
    const isNew = await upsertSignal(db, companyId, {
      ...d,
      audience: routeAudience(d.severity, d.kind, d.customerId, company.watchCriteria),
      source: "sla",
    });
    if (isNew) opened++;
  }

  // Resolve SLA signals that are no longer true.
  const keep = desired.map((d) => d.dedupeKey);
  const resolvedSla = await db
    .update(signals)
    .set({ status: "resolved", resolvedAt: sql`now()` })
    .where(
      and(
        eq(signals.companyId, companyId),
        eq(signals.status, "open"),
        eq(signals.source, "sla"),
        keep.length
          ? sql`${signals.dedupeKey} not in (${sql.join(
              keep.map((k) => sql`${k}`),
              sql`, `,
            )})`
          : sql`true`,
      ),
    )
    .returning({ id: signals.id });

  // AI signals: ETA flags close when their task closes; quality flags age out after 72 h.
  const openIds = new Set(ids);
  const resolveAi = openAi
    .filter(
      (s) =>
        (s.kind === "eta_not_forwarded" && s.taskId && !openIds.has(s.taskId)) ||
        (s.kind !== "eta_not_forwarded" &&
          now.getTime() - s.createdAt.getTime() > AI_QUALITY_TTL_HOURS * 3_600_000),
    )
    .map((s) => s.id);
  if (resolveAi.length) {
    await db
      .update(signals)
      .set({ status: "resolved", resolvedAt: sql`now()` })
      .where(and(eq(signals.companyId, companyId), inArray(signals.id, resolveAi)));
  }

  // Stuck reason + risk on tasks (ETA-flagged tasks explain themselves via the AI reason).
  const patchById = new Map(patches.map((p) => [p.taskId, p]));
  for (const t of openTasks) {
    const eta = openAi.find(
      (s) => s.kind === "eta_not_forwarded" && s.taskId === t.id && !resolveAi.includes(s.id),
    );
    const p = patchById.get(t.id);
    const stuckReason = p?.stuckReason ?? (eta ? eta.reason : null);
    const risk = Math.max(p?.risk ?? 0, eta ? Math.min(3, eta.severity - 1) : 0);
    if (JSON.stringify(stuckReason) !== JSON.stringify(t.stuckReason) || risk !== t.risk) {
      await db.update(tasks).set({ stuckReason, risk }).where(eq(tasks.id, t.id));
    }
  }

  const resolved = resolvedSla.length + resolveAi.length;
  if (opened || resolved) await scheduleOwnerDigest(db, companyId);
  return { opened, resolved };
}

/** Owner digest is regenerated on change, debounced (60 s; 3 s in demo mode). */
export async function scheduleOwnerDigest(db: Db, companyId: string): Promise<void> {
  const debounceMs = env().demoMode ? 3_000 : 60_000;
  await enqueue(db, {
    type: "owner_digest",
    companyId,
    payload: { companyId },
    dedupeKey: `digest:${companyId}`,
    debounceMs,
  });
}

/** Owner criteria changed: recompute who sees each open signal. */
export async function rerouteOpenSignals(db: Db, companyId: string): Promise<number> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return 0;
  const open = await db
    .select()
    .from(signals)
    .where(and(eq(signals.companyId, companyId), eq(signals.status, "open")));
  let changed = 0;
  for (const s of open) {
    const audience = routeAudience(s.severity, s.kind, s.customerId, company.watchCriteria);
    if (audience !== s.audience) {
      await db.update(signals).set({ audience }).where(eq(signals.id, s.id));
      changed++;
    }
  }
  return changed;
}
