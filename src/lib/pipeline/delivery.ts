import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  participants,
  suggestions,
  users,
  type Suggestion,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { enqueue } from "@/lib/jobs/queue";
import { ingestMessage, DEMO_DEBOUNCE_MS } from "@/lib/ingest/ingest";
import { redactOutbound } from "@/lib/security/redact";

export type DeliveryMode = "recorded" | "bot" | "copy";

/**
 * What happens after a human approves (or edits) a suggestion:
 * - demo channels: the text is recorded in the chat as sent by the dispatcher (the demo
 *   stand-in for pasting it into Telegram), so the pipeline reacts as it would live;
 * - Telegram + send mode "bot": the worker posts it via the bot (telegram_send job);
 * - otherwise: the UI copies it to the clipboard and the human pastes it.
 * Text is always passed through outbound secret redaction.
 */
export async function deliverSuggestion(
  db: Db,
  s: Suggestion,
  text: string,
  user: { id: string; name: string },
): Promise<{ mode: DeliveryMode; text: string }> {
  const clean = redactOutbound(text).text;
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, s.channelId), eq(channels.companyId, s.companyId)));
  const [company] = await db.select().from(companies).where(eq(companies.id, s.companyId));
  if (!ch || !company) return { mode: "copy", text: clean };

  if (ch.source === "demo") {
    const [p] = await db
      .select({ externalId: participants.externalId })
      .from(participants)
      .where(
        and(
          eq(participants.companyId, s.companyId),
          eq(participants.source, "demo"),
          eq(participants.userId, user.id),
        ),
      )
      .limit(1);
    const senderExternalId = p?.externalId ?? `user:${user.id}`;
    if (!p) {
      // First message from this user in demo chats: register them as staff before ingesting.
      await db
        .insert(participants)
        .values({
          companyId: s.companyId,
          source: "demo",
          externalId: senderExternalId,
          displayName: user.name,
          side: "employee",
          userId: user.id,
        })
        .onConflictDoNothing();
    }
    await ingestMessage(
      db,
      s.companyId,
      {
        source: "demo",
        channelExternalId: ch.externalId,
        channelTitle: ch.title,
        messageExternalId: `victor-${s.id}`,
        senderExternalId,
        senderName: user.name,
        text: clean,
        sentAt: new Date(),
        raw: { viaVictor: true, suggestionId: s.id },
      },
      { debounceMs: DEMO_DEBOUNCE_MS },
    );
    await db
      .update(suggestions)
      .set({ sendMode: "bot", sentAt: sql`now()` })
      .where(eq(suggestions.id, s.id));
    return { mode: "recorded", text: clean };
  }

  if (
    ch.source === "telegram" &&
    company.settings.sendMode === "bot" &&
    env().telegram.token &&
    !ch.externalId.startsWith("biz:")
  ) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, user.id));
    const body = company.settings.signWithName ? `${u?.name ?? user.name}: ${clean}` : clean;
    await enqueue(db, {
      type: "telegram_send",
      companyId: s.companyId,
      payload: {
        companyId: s.companyId,
        channelId: ch.id,
        text: body,
        suggestionId: s.id,
        userId: user.id,
        kind: "suggestion",
      },
    });
    await db.update(suggestions).set({ sendMode: "bot" }).where(eq(suggestions.id, s.id));
    return { mode: "bot", text: body };
  }

  await db
    .update(suggestions)
    .set({ sendMode: "copy", sentAt: sql`now()` })
    .where(eq(suggestions.id, s.id));
  return { mode: "copy", text: clean };
}
