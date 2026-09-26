import { and, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  customers,
  messages,
  participants,
  playbookRules,
  suggestions,
  taskEvents,
  tasks,
  users,
} from "@/lib/db/schema";
import type { Channel, Company, Customer } from "@/lib/db/schema";
import type { AnalysisInput, CtxChannel, CtxMessage, CtxRule, CtxTask } from "./types";

export const TIMELINE_LIMIT = 80;
const SHARED_LIMIT = 40;

export type IdMaps = {
  message: Map<
    string,
    {
      dbId: string;
      channelDbId: string;
      sentAt: Date;
      text: string;
      side: string;
      userId: string | null;
      chatType: string;
    }
  >;
  task: Map<string, string>;
  channel: Map<string, { dbId: string; chatType: string; shared: boolean }>;
  rule: Map<string, string>;
};

export type AnalysisContext = {
  input: AnalysisInput;
  maps: IdMaps;
  company: Company;
  customer: Customer;
  channels: Channel[];
};

/** Channels feeding a customer's analysis: its own + mapped shared ones (e.g. one Fleet chat). */
export async function customerChannels(
  db: Db,
  companyId: string,
  customerId: string,
): Promise<Channel[]> {
  return db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.companyId, companyId),
        eq(channels.active, true),
        isNotNull(channels.chatType),
        or(eq(channels.customerId, customerId), isNull(channels.customerId)),
      ),
    );
}

export async function buildAnalysisContext(
  db: Db,
  companyId: string,
  customerId: string,
  now: Date,
): Promise<AnalysisContext | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)));
  if (!company || !customer) return null;
  const [assignee] = customer.assignedUserId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, customer.assignedUserId))
    : [];

  const chans = await customerChannels(db, companyId, customerId);
  if (!chans.length) return null;
  const own = chans.filter((c) => c.customerId === customerId).map((c) => c.id);
  const shared = chans.filter((c) => c.customerId === null).map((c) => c.id);

  const select = {
    m: messages,
    side: participants.side,
    name: participants.displayName,
    userName: users.name,
    userId: participants.userId,
  };
  const ownRows = own.length
    ? await db
        .select(select)
        .from(messages)
        .leftJoin(participants, eq(participants.id, messages.participantId))
        .leftJoin(users, eq(users.id, participants.userId))
        .where(and(eq(messages.companyId, companyId), inArray(messages.channelId, own)))
        .orderBy(desc(messages.sentAt))
        .limit(TIMELINE_LIMIT)
    : [];
  const since = ownRows.length
    ? new Date(ownRows[ownRows.length - 1]!.m.sentAt.getTime() - 3_600_000)
    : new Date(now.getTime() - 3 * 86_400_000);
  const sharedRows = shared.length
    ? await db
        .select(select)
        .from(messages)
        .leftJoin(participants, eq(participants.id, messages.participantId))
        .leftJoin(users, eq(users.id, participants.userId))
        .where(
          and(
            eq(messages.companyId, companyId),
            inArray(messages.channelId, shared),
            gte(messages.sentAt, since),
          ),
        )
        .orderBy(desc(messages.sentAt))
        .limit(SHARED_LIMIT)
    : [];
  const rows = [...ownRows, ...sharedRows].sort(
    (a, b) => a.m.sentAt.getTime() - b.m.sentAt.getTime(),
  );

  const maps: IdMaps = { message: new Map(), task: new Map(), channel: new Map(), rule: new Map() };
  const chanShort = new Map<string, string>();
  chans.forEach((c, i) => {
    const id = `c${i + 1}`;
    chanShort.set(c.id, id);
    maps.channel.set(id, { dbId: c.id, chatType: c.chatType!, shared: c.customerId === null });
  });
  const msgShort = new Map<string, string>();
  const extShort = new Map<string, string>();
  rows.forEach((r, i) => {
    const id = `m${i + 1}`;
    msgShort.set(r.m.id, id);
    extShort.set(`${r.m.channelId}:${r.m.externalId}`, id);
  });
  const chanById = new Map(chans.map((c) => [c.id, c]));

  const ctxMessages: CtxMessage[] = rows.map((r) => {
    const ch = chanById.get(r.m.channelId)!;
    const id = msgShort.get(r.m.id)!;
    maps.message.set(id, {
      dbId: r.m.id,
      channelDbId: r.m.channelId,
      sentAt: r.m.sentAt,
      text: r.m.text,
      side: r.side ?? "unknown",
      userId: r.userId ?? null,
      chatType: ch.chatType!,
    });
    return {
      id,
      dbId: r.m.id,
      channelId: chanShort.get(r.m.channelId)!,
      chatType: ch.chatType!,
      channelTitle: ch.title,
      side: r.side ?? "unknown",
      senderName: r.name ?? "unknown",
      userName: r.userName ?? null,
      text: r.m.text,
      sentAt: r.m.sentAt,
      untrusted: r.m.untrustedFlag,
      replyToId: r.m.replyToExternalId
        ? (extShort.get(`${r.m.channelId}:${r.m.replyToExternalId}`) ?? null)
        : null,
    };
  });

  const ctxChannels: CtxChannel[] = chans.map((c) => {
    const msgs = rows.filter((r) => r.m.channelId === c.id);
    const ru = msgs.filter((r) => r.m.lang === "ru").length;
    const lang: "en" | "ru" = msgs.length
      ? ru * 2 > msgs.length
        ? "ru"
        : "en"
      : c.chatType === "customer"
        ? "en"
        : "ru";
    return {
      id: chanShort.get(c.id)!,
      dbId: c.id,
      title: c.title,
      chatType: c.chatType!,
      shared: c.customerId === null,
      lang,
    };
  });

  // Open tasks + tasks closed in the last 48 h (so the model doesn't recreate them).
  const taskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, companyId),
        eq(tasks.customerId, customerId),
        or(
          inArray(tasks.status, ["received", "acknowledged", "in_progress", "deadline_set"]),
          gte(tasks.closedAt, new Date(now.getTime() - 48 * 3_600_000)),
        ),
      ),
    )
    .orderBy(tasks.createdAt);
  const eventRows = taskRows.length
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
  const ctxTasks: CtxTask[] = taskRows.map((t, i) => {
    const id = `t${i + 1}`;
    maps.task.set(id, t.id);
    return {
      id,
      dbId: t.id,
      title: t.title,
      kind: t.kind,
      status: t.status,
      ref: t.ref,
      deadlineAt: t.deadlineAt,
      channelId: t.channelId ? (chanShort.get(t.channelId) ?? null) : null,
      createdFromId: t.createdFromMessageId ? (msgShort.get(t.createdFromMessageId) ?? null) : null,
      createdAt: t.createdAt,
      events: eventRows
        .filter((e) => e.taskId === t.id)
        .map((e) => ({
          toStatus: e.toStatus,
          at: e.at,
          evidenceId: e.evidenceMessageId ? (msgShort.get(e.evidenceMessageId) ?? null) : null,
        })),
    };
  });

  const ruleRows = await db
    .select()
    .from(playbookRules)
    .where(
      and(
        eq(playbookRules.companyId, companyId),
        eq(playbookRules.status, "active"),
        or(
          eq(playbookRules.scope, "company"),
          eq(playbookRules.scope, "chat_type"),
          and(eq(playbookRules.scope, "customer"), eq(playbookRules.customerId, customerId)),
        ),
      ),
    )
    .orderBy(playbookRules.createdAt);
  const ctxRules: CtxRule[] = ruleRows.map((r, i) => {
    const id = `r${i + 1}`;
    maps.rule.set(id, r.id);
    return { id, dbId: r.id, text: r.ruleText, scope: r.scope, chatType: r.chatType };
  });

  const edits = await db
    .select({ s: suggestions, title: channels.title })
    .from(suggestions)
    .innerJoin(channels, eq(channels.id, suggestions.channelId))
    .where(
      and(
        eq(suggestions.companyId, companyId),
        eq(suggestions.customerId, customerId),
        eq(suggestions.status, "edited"),
      ),
    )
    .orderBy(desc(suggestions.decidedAt))
    .limit(5);

  return {
    company,
    customer,
    channels: chans,
    maps,
    input: {
      now,
      company: {
        name: company.name,
        timezone: company.timezone,
        sla: company.sla,
        watchCriteria: company.watchCriteria,
      },
      customer: {
        name: customer.name,
        kind: customer.kind,
        brief: customer.brief,
        assigneeName: assignee?.name ?? null,
      },
      channels: ctxChannels,
      messages: ctxMessages,
      tasks: ctxTasks,
      rules: ctxRules,
      recentEdits: edits.map((e) => ({
        proposed: e.s.proposedText,
        final: e.s.finalText ?? "",
        reason: e.s.editReason,
        channelTitle: e.title,
      })),
    },
  };
}

/** Customers with mapped channels (used by schedulers and demo control). */
export async function mappedCustomerIds(db: Db, companyId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: channels.customerId })
    .from(channels)
    .where(
      and(
        eq(channels.companyId, companyId),
        isNotNull(channels.customerId),
        sql`${channels.chatType} is not null`,
      ),
    );
  return rows.map((r) => r.id!).filter(Boolean);
}
