import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  customers,
  messages,
  participants,
  signals,
  suggestions,
  taskEvents,
  tasks,
  users,
} from "@/lib/db/schema";

export async function taskDetail(db: Db, companyId: string, taskId: string) {
  const [row] = await db
    .select({
      t: tasks,
      customerName: customers.name,
      customerAssignee: customers.assignedUserId,
      channelTitle: channels.title,
      chatType: channels.chatType,
    })
    .from(tasks)
    .innerJoin(customers, eq(customers.id, tasks.customerId))
    .leftJoin(channels, eq(channels.id, tasks.channelId))
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, companyId)));
  if (!row) return null;
  const [company] = await db
    .select({ tz: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId));
  const responsibleId = row.t.assigneeUserId ?? row.customerAssignee;
  const [responsible] = responsibleId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, responsibleId))
    : [];

  const events = await db
    .select({
      e: taskEvents,
      text: messages.text,
      sentAt: messages.sentAt,
      sender: participants.displayName,
      channelTitle: channels.title,
      chatType: channels.chatType,
    })
    .from(taskEvents)
    .leftJoin(messages, eq(messages.id, taskEvents.evidenceMessageId))
    .leftJoin(participants, eq(participants.id, messages.participantId))
    .leftJoin(channels, eq(channels.id, messages.channelId))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(taskEvents.at);

  const sigs = await db
    .select()
    .from(signals)
    .where(and(eq(signals.companyId, companyId), eq(signals.taskId, taskId)))
    .orderBy(desc(signals.createdAt));
  const sugs = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.companyId, companyId), eq(suggestions.taskId, taskId)))
    .orderBy(desc(suggestions.createdAt))
    .limit(5);

  return {
    timezone: company?.tz ?? "America/Chicago",
    task: {
      id: row.t.id,
      title: row.t.title,
      kind: row.t.kind,
      status: row.t.status,
      ref: row.t.ref,
      deadlineAt: row.t.deadlineAt,
      stuckReason: row.t.stuckReason,
      risk: row.t.risk,
      createdAt: row.t.createdAt,
      closedAt: row.t.closedAt,
      customerId: row.t.customerId,
      customerName: row.customerName,
      channelId: row.t.channelId,
      channelTitle: row.channelTitle,
      chatType: row.chatType,
      responsibleName: responsible?.name ?? null,
    },
    events: events.map((x) => ({
      id: x.e.id,
      from: x.e.fromStatus,
      to: x.e.toStatus,
      at: x.e.at,
      actor: x.e.actor,
      explanation: x.e.explanation,
      evidence: x.text
        ? {
            id: x.e.evidenceMessageId,
            text: x.text,
            sentAt: x.sentAt,
            sender: x.sender,
            channelTitle: x.channelTitle,
            chatType: x.chatType,
          }
        : null,
    })),
    signals: sigs.map((s) => ({
      id: s.id,
      kind: s.kind,
      severity: s.severity,
      status: s.status,
      title: s.title,
      reason: s.reason,
      evidenceQuote: s.evidenceQuote,
      createdAt: s.createdAt,
      resolvedAt: s.resolvedAt,
    })),
    suggestions: sugs.map((s) => ({
      id: s.id,
      status: s.status,
      intent: s.intent,
      text: s.finalText ?? s.proposedText,
      createdAt: s.createdAt,
    })),
  };
}
