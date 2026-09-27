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
    viaVictor: Boolean((r.m.raw as { viaVictor?: boolean } | null)?.viaVictor),
  }));
}

export type WallMark =
  | { type: "task"; title: { en: string; ru: string } }
  | { type: "status"; status: string }
  | { type: "signal"; kind: string; severity: number }
  | { type: "context" };

/**
 * The "chaos wall": the latest raw messages of every mapped chat, plus what the pipeline saw in
 * each one (tasks it created, statuses it proved, signals it raised, context it reused).
 */
export async function sourcesWall(db: Db, companyId: string, perChat = 40) {
  const chans = await db
    .select({ ch: channels, customerName: customers.name })
    .from(channels)
    .leftJoin(customers, eq(customers.id, channels.customerId))
    .where(and(eq(channels.companyId, companyId), sql`${channels.chatType} is not null`))
    .orderBy(desc(channels.lastMessageAt));
  const rows = await db.execute<{
    id: string;
    channel_id: string;
    text: string;
    sent_at: Date;
    sender: string | null;
    side: string | null;
    untrusted: boolean;
  }>(sql`
    select id, channel_id, text, sent_at, sender, side, untrusted from (
      select m.id, m.channel_id, m.text, m.sent_at, p.display_name as sender, p.side,
        m.untrusted_flag as untrusted,
        row_number() over (partition by m.channel_id order by m.sent_at desc) as rn
      from messages m left join participants p on p.id = m.participant_id
      where m.company_id = ${companyId}
    ) x where rn <= ${perChat} order by sent_at`);
  const ids = rows.map((r) => r.id);
  const marks: Record<string, WallMark[]> = {};
  const add = (id: string | null, m: WallMark) => {
    if (!id || !ids.includes(id)) return;
    (marks[id] ??= []).push(m);
  };
  if (ids.length) {
    const inIds = sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    );
    const created = await db.execute<{ mid: string; title: { en: string; ru: string } }>(
      sql`select created_from_message_id as mid, title from tasks where company_id = ${companyId} and created_from_message_id in (${inIds})`,
    );
    for (const r of created) add(r.mid, { type: "task", title: r.title });
    const ev = await db.execute<{ mid: string; to_status: string }>(
      sql`select evidence_message_id as mid, to_status from task_events where company_id = ${companyId} and to_status <> 'received' and evidence_message_id in (${inIds})`,
    );
    for (const r of ev) add(r.mid, { type: "status", status: r.to_status });
    const sig = await db.execute<{ mid: string; kind: string; severity: number }>(
      sql`select evidence_message_id as mid, kind, severity from signals where company_id = ${companyId} and status = 'open' and evidence_message_id in (${inIds})`,
    );
    for (const r of sig) add(r.mid, { type: "signal", kind: r.kind, severity: Number(r.severity) });
    const ctx = await db.execute<{ mid: string }>(
      sql`select distinct jsonb_array_elements_text(used_context->'messageIds') as mid from suggestions
          where company_id = ${companyId} and status = 'pending'`,
    );
    for (const r of ctx) add(r.mid, { type: "context" });
  }
  return {
    channels: chans.map((c) => ({
      id: c.ch.id,
      title: c.ch.title,
      chatType: c.ch.chatType,
      source: c.ch.source,
      customerName: c.customerName,
      messages: rows
        .filter((r) => r.channel_id === c.ch.id)
        .map((r) => ({
          id: r.id,
          text: r.text,
          sentAt: new Date(r.sent_at),
          sender: r.sender ?? "unknown",
          side: r.side ?? "unknown",
          untrusted: Boolean(r.untrusted),
        })),
    })),
    marks,
    totals: { chats: chans.length, messages: rows.length },
  };
}
