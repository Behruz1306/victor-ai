import { and, desc, eq, gte, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  messages,
  participants,
  playbookRules,
  signals,
  suggestions,
  taskEvents,
  tasks,
  users,
  type Channel,
} from "@/lib/db/schema";
import type { Ctx } from "@/lib/auth/guard";
import { matchSharedMessage } from "@/lib/ingest/ingest";
import { visibleCustomers } from "./scope";
import { editRate } from "./metrics";
import type { L10n } from "@/lib/types";

export type Badge = "reply_now" | "ask_fleet" | "overdue" | "complaint" | "tone" | "no_deadline";

const BADGE_OF: Record<string, Badge> = {
  reply_needed: "reply_now",
  no_ack: "reply_now",
  eta_not_forwarded: "reply_now",
  overdue: "overdue",
  complaint: "complaint",
  rude_tone: "tone",
  context_ignored: "tone",
  missing_deadline: "no_deadline",
};
const BADGE_ORDER: Badge[] = [
  "reply_now",
  "ask_fleet",
  "overdue",
  "complaint",
  "no_deadline",
  "tone",
];
const FACING = new Set(["customer", "billing", "support"]);

export async function dispatcherOverview(db: Db, ctx: Ctx, asUserId?: string | null) {
  const custs = await visibleCustomers(db, ctx, asUserId);
  const ids = custs.map((c) => c.id);
  const viewUserId = ctx.role === "dispatcher" ? ctx.userId : (asUserId ?? null);
  const rate = await editRate(db, ctx.companyId, viewUserId ? { userId: viewUserId } : {});
  if (!ids.length) return { customers: [], stats: { editRate: rate, urgent: 0 } };

  const chans = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.companyId, ctx.companyId),
        eq(channels.active, true),
        isNotNull(channels.chatType),
        or(inArray(channels.customerId, ids), isNull(channels.customerId)),
      ),
    );
  const openSignals = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.companyId, ctx.companyId),
        eq(signals.status, "open"),
        inArray(signals.customerId, ids),
      ),
    );
  const pending = await db
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.companyId, ctx.companyId),
        eq(suggestions.status, "pending"),
        inArray(suggestions.customerId, ids),
      ),
    );

  // Last message and "new since the team last spoke" per channel.
  const chanIds = chans.map((c) => c.id);
  const lastRows = chanIds.length
    ? await db.execute<{
        channel_id: string;
        text: string;
        sent_at: Date;
        sender: string | null;
        side: string | null;
        unread: number;
      }>(sql`
        select distinct on (m.channel_id) m.channel_id, m.text, m.sent_at, p.display_name as sender, p.side,
          (select count(*)::int from messages m2 join participants p2 on p2.id = m2.participant_id
            where m2.channel_id = m.channel_id and p2.side = 'customer'
              and m2.sent_at > coalesce((select max(m3.sent_at) from messages m3 join participants p3 on p3.id = m3.participant_id
                where m3.channel_id = m.channel_id and p3.side in ('employee','bot')), 'epoch')) as unread
        from messages m left join participants p on p.id = m.participant_id
        where m.channel_id in (${sql.join(
          chanIds.map((i) => sql`${i}`),
          sql`, `,
        )})
        order by m.channel_id, m.sent_at desc`)
    : [];
  const lastBy = new Map(lastRows.map((r) => [r.channel_id, r]));

  const out = custs.map((c) => {
    const rows = chans
      .filter((ch) => ch.customerId === c.id || ch.customerId === null)
      .map((ch) => {
        const sig = openSignals.filter((s) => s.customerId === c.id && s.channelId === ch.id);
        const sug = pending.filter((s) => s.customerId === c.id && s.channelId === ch.id);
        if (ch.customerId === null && !sig.length && !sug.length) return null; // shared chat: only when it needs action
        const badges = new Set<Badge>();
        for (const s of sig) if (BADGE_OF[s.kind]) badges.add(BADGE_OF[s.kind]!);
        if (sug.some((s) => s.intent === "ask_fleet_eta")) badges.add("ask_fleet");
        const last = lastBy.get(ch.id);
        const maxSev = sig.reduce((a, s) => Math.max(a, s.severity), 0);
        return {
          id: ch.id,
          title: ch.title,
          chatType: ch.chatType,
          source: ch.source,
          shared: ch.customerId === null,
          badges: BADGE_ORDER.filter((b) => badges.has(b)),
          maxSeverity: maxSev,
          hasSuggestion: sug.length > 0,
          unread: FACING.has(ch.chatType ?? "") ? Number(last?.unread ?? 0) : 0,
          last: last
            ? {
                text: last.text.slice(0, 120),
                at: new Date(last.sent_at),
                sender: last.sender,
                side: last.side,
              }
            : null,
          urgency: maxSev + (sug.length ? 0.5 : 0) + (FACING.has(ch.chatType ?? "") ? 0.1 : 0),
        };
      })
      .filter(<T>(x: T | null): x is T => x !== null)
      .sort(
        (a, b) =>
          b.urgency - a.urgency || (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0),
      );
    const urgency = rows.reduce((a, r) => Math.max(a, r.urgency), 0);
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      assignedUserId: c.assignedUserId,
      urgency,
      channels: rows,
    };
  });
  out.sort((a, b) => b.urgency - a.urgency || a.name.localeCompare(b.name));
  return {
    customers: out,
    stats: { editRate: rate, urgent: openSignals.filter((s) => s.severity >= 3).length },
  };
}

function relevantShared(ch: Channel, text: string, name: string, refs: string[]): boolean {
  return (
    ch.customerId !== null || matchSharedMessage(text, [{ customerId: "x", name, refs }]).length > 0
  );
}

export async function customerDetail(db: Db, companyId: string, customerId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const custRows = await db.execute<{
    id: string;
    name: string;
    kind: string;
    brief: string;
    assignee: string | null;
  }>(sql`
    select c.id, c.name, c.kind, c.brief, u.name as assignee from customers c
    left join users u on u.id = c.assigned_user_id where c.id = ${customerId} and c.company_id = ${companyId}`);
  const customer = custRows[0];
  if (!company || !customer) return null;

  const chans = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.companyId, companyId),
        isNotNull(channels.chatType),
        or(eq(channels.customerId, customerId), isNull(channels.customerId)),
      ),
    );
  const chanById = new Map(chans.map((c) => [c.id, c]));

  const taskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, companyId),
        eq(tasks.customerId, customerId),
        or(
          notInArray(tasks.status, ["delivered", "cancelled"]),
          gte(tasks.closedAt, new Date(Date.now() - 36 * 3_600_000)),
        ),
      ),
    )
    .orderBy(desc(tasks.lastEventAt));
  const events = taskRows.length
    ? await db
        .select()
        .from(taskEvents)
        .where(
          inArray(
            taskEvents.taskId,
            taskRows.map((t) => t.id),
          ),
        )
        .orderBy(taskEvents.at)
    : [];
  const sigRows = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.companyId, companyId),
        eq(signals.customerId, customerId),
        eq(signals.status, "open"),
      ),
    )
    .orderBy(desc(signals.severity));
  const sugRows = await db
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.companyId, companyId),
        eq(suggestions.customerId, customerId),
        eq(suggestions.status, "pending"),
      ),
    )
    .orderBy(desc(suggestions.createdAt));

  const referenced = new Set<string>();
  for (const s of sugRows) s.usedContext.messageIds.forEach((m) => referenced.add(m));
  for (const s of sigRows) if (s.evidenceMessageId) referenced.add(s.evidenceMessageId);
  for (const e of events) if (e.evidenceMessageId) referenced.add(e.evidenceMessageId);
  const refs = taskRows.flatMap((t) => (t.ref ? t.ref.split("/") : []));

  const msgRows = await db
    .select({
      m: messages,
      sender: participants.displayName,
      side: participants.side,
      userName: users.name,
    })
    .from(messages)
    .leftJoin(participants, eq(participants.id, messages.participantId))
    .leftJoin(users, eq(users.id, participants.userId))
    .where(
      and(
        eq(messages.companyId, companyId),
        inArray(
          messages.channelId,
          chans.map((c) => c.id),
        ),
      ),
    )
    .orderBy(desc(messages.sentAt))
    .limit(250);
  const timeline = msgRows
    .filter((r) => {
      const ch = chanById.get(r.m.channelId)!;
      return referenced.has(r.m.id) || relevantShared(ch, r.m.text, customer.name, refs);
    })
    .slice(0, 150)
    .reverse();

  // What each message produced.
  const highlights: Record<
    string,
    { type: "task" | "signal" | "context"; label: L10n; kind?: string; severity?: number }[]
  > = {};
  const mark = (id: string | null, h: (typeof highlights)[string][number]) => {
    if (!id) return;
    (highlights[id] ??= []).push(h);
  };
  for (const t of taskRows)
    mark(t.createdFromMessageId, { type: "task", label: t.title, kind: t.kind });
  for (const s of sigRows)
    mark(s.evidenceMessageId, {
      type: "signal",
      label: s.title,
      kind: s.kind,
      severity: s.severity,
    });

  const msgById = new Map(msgRows.map((r) => [r.m.id, r]));
  const ruleIds = [...new Set(sugRows.flatMap((s) => s.usedContext.ruleIds))];
  const ruleRows = ruleIds.length
    ? await db
        .select()
        .from(playbookRules)
        .where(and(eq(playbookRules.companyId, companyId), inArray(playbookRules.id, ruleIds)))
    : [];

  return {
    timezone: company.timezone,
    sendMode: company.settings.sendMode,
    customer,
    channels: chans.map((c) => ({
      id: c.id,
      title: c.title,
      chatType: c.chatType,
      source: c.source,
      shared: c.customerId === null,
    })),
    timeline: timeline.map((r) => ({
      id: r.m.id,
      channelId: r.m.channelId,
      text: r.m.text,
      sentAt: r.m.sentAt,
      sender: r.sender ?? "unknown",
      side: r.side ?? "unknown",
      userName: r.userName,
      untrusted: r.m.untrustedFlag,
      viaPulse: Boolean((r.m.raw as { viaPulse?: boolean } | null)?.viaPulse),
    })),
    highlights,
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      status: t.status,
      ref: t.ref,
      deadlineAt: t.deadlineAt,
      stuckReason: t.stuckReason,
      risk: t.risk,
      channelId: t.channelId,
      events: events
        .filter((e) => e.taskId === t.id)
        .map((e) => ({ toStatus: e.toStatus, at: e.at })),
    })),
    signals: sigRows.map((s) => ({
      id: s.id,
      kind: s.kind,
      severity: s.severity,
      title: s.title,
      reason: s.reason,
      channelId: s.channelId,
      taskId: s.taskId,
      evidenceQuote: s.evidenceQuote,
      createdAt: s.createdAt,
    })),
    suggestions: sugRows.map((s) => {
      const ch = chanById.get(s.channelId);
      return {
        id: s.id,
        channelId: s.channelId,
        channelTitle: ch?.title ?? "",
        chatType: ch?.chatType ?? null,
        source: ch?.source ?? "demo",
        taskId: s.taskId,
        intent: s.intent,
        text: s.proposedText,
        rationale: s.rationale,
        createdAt: s.createdAt,
        usedContext: s.usedContext.messageIds
          .map((id) => msgById.get(id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => ({
            id: r.m.id,
            channelTitle: chanById.get(r.m.channelId)?.title ?? "",
            chatType: chanById.get(r.m.channelId)?.chatType ?? null,
            sentAt: r.m.sentAt,
            sender: r.sender ?? "",
            text: r.m.text.slice(0, 200),
            crossChat: r.m.channelId !== s.channelId,
          })),
        rules: ruleRows
          .filter((r) => s.usedContext.ruleIds.includes(r.id))
          .map((r) => ({ id: r.id, text: r.ruleText })),
      };
    }),
  };
}
