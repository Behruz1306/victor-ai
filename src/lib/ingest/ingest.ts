import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, customers, messages, participants, tasks, users } from "@/lib/db/schema";
import type { Channel } from "@/lib/db/schema";
import { screenInbound } from "@/lib/security/injection";
import { enqueue } from "@/lib/jobs/queue";
import { detectLang, sideFor, type NormalizedMessage } from "./normalize";

export const ANALYSIS_DEBOUNCE_MS = 15_000;
export const DEMO_DEBOUNCE_MS = 2_000;

export type IngestResult = {
  inserted: boolean;
  messageId: string | null;
  channelId: string;
  flagged: boolean;
  analyzeCustomerIds: string[];
};

const GENERIC_NAME_WORDS = new Set([
  "logistics",
  "foods",
  "food",
  "brokerage",
  "freight",
  "llc",
  "inc",
  "co",
  "company",
  "group",
  "transport",
  "transportation",
  "trucking",
  "corp",
  "ltd",
]);

/** Core of a customer name used to spot it in shared-chat text ("Apex Logistics" → "apex"). */
export function customerNameCore(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !GENERIC_NAME_WORDS.has(w));
  return words.join(" ");
}

/** Pure: which customers a shared-chat (e.g. Fleet) message is about. */
export function matchSharedMessage(
  text: string,
  candidates: { customerId: string; name: string; refs: string[] }[],
): string[] {
  const lower = text.toLowerCase();
  const hits = candidates.filter((c) => {
    const core = customerNameCore(c.name);
    if (core.length >= 3 && lower.includes(core)) return true;
    return c.refs.some((r) => r && lower.includes(r.toLowerCase()));
  });
  return hits.map((h) => h.customerId);
}

async function upsertChannel(db: Db, companyId: string, msg: NormalizedMessage): Promise<Channel> {
  const [row] = await db
    .insert(channels)
    .values({
      companyId,
      source: msg.source,
      externalId: msg.channelExternalId,
      title: msg.channelTitle,
      lastMessageAt: msg.sentAt,
    })
    .onConflictDoUpdate({
      target: [channels.companyId, channels.source, channels.externalId],
      set: {
        // Telegram titles change; keep the latest. Mapping (customer, chat type) is never touched here.
        title: sql`case when excluded.source = 'telegram' then excluded.title else ${channels.title} end`,
        lastMessageAt: sql`greatest(${channels.lastMessageAt}, excluded.last_message_at)`,
      },
    })
    .returning();
  return row!;
}

async function upsertParticipant(
  db: Db,
  companyId: string,
  msg: NormalizedMessage,
  channel: Channel,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.companyId, companyId),
        eq(participants.source, msg.source),
        eq(participants.externalId, msg.senderExternalId),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.side === "unknown" && channel.chatType) {
      await db
        .update(participants)
        .set({
          side: sideFor({ linkedUser: Boolean(existing.userId), chatType: channel.chatType }),
        })
        .where(eq(participants.id, existing.id));
    }
    return existing.id;
  }
  // Telegram senders are linked to employees by their Telegram user id.
  let userId: string | null = null;
  if (msg.source === "telegram") {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.telegramUserId, msg.senderExternalId)))
      .limit(1);
    userId = u?.id ?? null;
  }
  const [row] = await db
    .insert(participants)
    .values({
      companyId,
      source: msg.source,
      externalId: msg.senderExternalId,
      displayName: msg.senderName,
      userId,
      side: sideFor({
        linkedUser: Boolean(userId),
        isBot: msg.senderIsBot,
        chatType: channel.chatType,
      }),
    })
    .onConflictDoNothing()
    .returning({ id: participants.id });
  if (row) return row.id;
  const [again] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.companyId, companyId),
        eq(participants.source, msg.source),
        eq(participants.externalId, msg.senderExternalId),
      ),
    );
  return again!.id;
}

/** Customers whose analysis should run after a message in `channel`. */
export async function customersToAnalyze(
  db: Db,
  companyId: string,
  channel: Channel,
  text: string,
) {
  if (channel.customerId) return [channel.customerId];
  if (!channel.chatType) return [];
  // Shared chat (e.g. one Fleet chat for all customers): route by name or load/truck refs.
  const custs = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  const open = await db
    .select({ customerId: tasks.customerId, ref: tasks.ref })
    .from(tasks)
    .where(
      and(eq(tasks.companyId, companyId), notInArray(tasks.status, ["delivered", "cancelled"])),
    );
  const candidates = custs.map((c) => ({
    customerId: c.id,
    name: c.name,
    refs: open.filter((t) => t.customerId === c.id && t.ref).map((t) => t.ref!),
  }));
  const matched = matchSharedMessage(text, candidates);
  if (matched.length) return matched;
  return [...new Set(open.map((t) => t.customerId))];
}

/**
 * The single writer of `messages`. Upserts channel + participant, screens the text for
 * prompt injection, inserts idempotently and schedules a debounced analysis.
 */
export async function ingestMessage(
  db: Db,
  companyId: string,
  msg: NormalizedMessage,
  opts: { debounceMs?: number } = {},
): Promise<IngestResult> {
  const channel = await upsertChannel(db, companyId, msg);
  const participantId = await upsertParticipant(db, companyId, msg, channel);
  const screened = screenInbound(msg.text);
  const [inserted] = await db
    .insert(messages)
    .values({
      companyId,
      channelId: channel.id,
      participantId,
      externalId: msg.messageExternalId,
      text: screened.text,
      lang: detectLang(screened.text),
      sentAt: msg.sentAt,
      replyToExternalId: msg.replyTo ?? null,
      untrustedFlag: screened.flagged,
      raw: { ...(msg.raw ?? {}), screen: screened.flagged ? screened.flags : undefined },
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });

  const result: IngestResult = {
    inserted: Boolean(inserted),
    messageId: inserted?.id ?? null,
    channelId: channel.id,
    flagged: screened.flagged,
    analyzeCustomerIds: [],
  };
  if (!inserted) return result;

  if (!channel.chatType) {
    // Unmapped chat: ask the AI for a mapping proposal once, never analyze.
    if (!channel.mappingProposal) {
      await enqueue(db, {
        type: "map_proposal",
        companyId,
        payload: { channelId: channel.id },
        dedupeKey: `map:${channel.id}`,
        debounceMs: 5_000,
      });
    }
    return result;
  }
  const debounce = opts.debounceMs ?? ANALYSIS_DEBOUNCE_MS;
  result.analyzeCustomerIds = await customersToAnalyze(db, companyId, channel, screened.text);
  for (const customerId of result.analyzeCustomerIds) {
    await enqueue(db, {
      type: "analyze_customer",
      companyId,
      payload: { companyId, customerId },
      dedupeKey: `analyze:${customerId}`,
      debounceMs: debounce,
    });
  }
  return result;
}

/** Channels waiting for the owner to map them. */
export function unmappedFilter(companyId: string) {
  return and(eq(channels.companyId, companyId), isNull(channels.chatType));
}
