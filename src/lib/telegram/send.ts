import { Api, GrammyError } from "grammy";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, suggestions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { redactOutbound } from "@/lib/security/redact";
import { ingestMessage } from "@/lib/ingest/ingest";
import { chunkText } from "./format";

export type TelegramSendPayload = {
  companyId: string;
  channelId: string;
  text: string;
  suggestionId?: string | null;
  userId?: string | null;
  kind?: "suggestion" | "consent";
};

/** The only outbound side effect in the system. Runs in the worker after a human approved it. */
export async function telegramSend(db: Db, p: TelegramSendPayload): Promise<void> {
  const token = env().telegram.token;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, p.channelId), eq(channels.companyId, p.companyId)));
  if (!ch || ch.source !== "telegram") throw new Error("channel is not a Telegram chat");
  if (ch.externalId.startsWith("biz:"))
    throw new Error("sending into Business 1:1 chats is not enabled");

  const redacted = redactOutbound(p.text);
  if (!redacted.clean) {
    console.warn(
      `[telegram] outbound redaction: ${redacted.findings.map((f) => f.name).join(", ")}`,
    );
  }
  const api = new Api(token);
  let lastId: number | null = null;
  for (const chunk of chunkText(redacted.text)) {
    try {
      const sent = await api.sendMessage(Number(ch.externalId), chunk);
      lastId = sent.message_id;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 429) {
        throw new Error(`rate limited, retry after ${err.parameters.retry_after ?? 5}s`);
      }
      throw err;
    }
  }
  if (p.kind === "consent") {
    await db
      .update(channels)
      .set({ consentPostedAt: sql`now()` })
      .where(eq(channels.id, ch.id));
    return;
  }
  // Bots don't receive their own messages, so record the send in the timeline ourselves.
  const [u] = p.userId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, p.userId))
    : [];
  if (lastId) {
    await ingestMessage(db, p.companyId, {
      source: "telegram",
      channelExternalId: ch.externalId,
      channelTitle: ch.title,
      messageExternalId: String(lastId),
      senderExternalId: `bot:${p.userId ?? "victor"}`,
      senderName: u ? `${u.name} (via Victor AI bot)` : "Victor AI bot",
      senderIsBot: true,
      text: redacted.text,
      sentAt: new Date(),
      raw: { viaVictor: true, suggestionId: p.suggestionId ?? null },
    });
  }
  if (p.suggestionId) {
    await db
      .update(suggestions)
      .set({ sentAt: sql`now()` })
      .where(eq(suggestions.id, p.suggestionId));
  }
}
