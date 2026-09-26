import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, customers, messages, participants, systemState, users } from "@/lib/db/schema";

export async function listSources(db: Db, companyId: string) {
  const rows = await db
    .select({
      ch: channels,
      customerName: customers.name,
      count: sql<number>`(select count(*)::int from messages m where m.channel_id = ${channels.id})`,
    })
    .from(channels)
    .leftJoin(customers, eq(customers.id, channels.customerId))
    .where(eq(channels.companyId, companyId))
    .orderBy(desc(channels.lastMessageAt));
  const custs = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId))
    .orderBy(asc(customers.name));
  const dispatchers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "dispatcher"), eq(users.active, true)))
    .orderBy(asc(users.name));
  const [bot] = await db.select().from(systemState).where(eq(systemState.key, "telegram_bot"));
  return {
    channels: rows.map((r) => ({
      id: r.ch.id,
      source: r.ch.source,
      title: r.ch.title,
      chatType: r.ch.chatType,
      customerId: r.ch.customerId,
      customerName: r.customerName,
      active: r.ch.active,
      lastMessageAt: r.ch.lastMessageAt,
      consentPostedAt: r.ch.consentPostedAt,
      proposal: r.ch.mappingProposal,
      messageCount: Number(r.count),
    })),
    customers: custs,
    dispatchers,
    botConfigured: Boolean(bot?.value?.configured),
  };
}

export async function channelMessages(db: Db, companyId: string, channelId: string, limit = 200) {
  const rows = await db
    .select({
      m: messages,
      sender: participants.displayName,
      side: participants.side,
      userName: users.name,
    })
    .from(messages)
    .leftJoin(participants, eq(participants.id, messages.participantId))
    .leftJoin(users, eq(users.id, participants.userId))
    .where(and(eq(messages.companyId, companyId), eq(messages.channelId, channelId)))
    .orderBy(desc(messages.sentAt))
    .limit(limit);
  return rows.reverse().map((r) => ({
    id: r.m.id,
    text: r.m.text,
    sentAt: r.m.sentAt,
    sender: r.sender ?? "unknown",
    side: r.side ?? "unknown",
    userName: r.userName,
    untrusted: r.m.untrustedFlag,
    lang: r.m.lang,
    viaPulse: Boolean((r.m.raw as { viaPulse?: boolean } | null)?.viaPulse),
  }));
}
