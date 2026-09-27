import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Update, UserFromGetMe } from "grammy/types";
import { getDb } from "@/lib/db/client";
import { channels, customers, messages, participants, suggestions, tasks } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { createBot } from "@/worker/telegram";
import { resetDatabase } from "./helpers";

// The live-mode path end to end: a raw Telegram Update (exactly what getUpdates returns) goes
// through the same grammY handlers the long poller uses — no network, bot identity injected.
const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();
const CHAT = { id: -1002233445566, title: "Apex ↔ Blue Ridge (live)", type: "supergroup" as const };
const BOT_INFO: UserFromGetMe = {
  id: 8123456789,
  is_bot: true,
  first_name: "Victor AI",
  username: "victorai5_bot",
  can_join_groups: true,
  can_manage_bots: false,
  supports_join_request_queries: false,
  can_read_all_group_messages: true,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

let companyId = "";
let apexId = "";

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const [apex] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.name, "Apex Logistics")));
  apexId = apex!.id;
});

describe("Telegram Update JSON → the poller's handler → task + suggestion", () => {
  const bot = createBot(db, {
    token: "123456789:TEST_TOKEN_NEVER_USED_FOR_NETWORK_CALLS",
    botInfo: BOT_INFO,
  })!;

  it("bot added to a group → the chat appears as unmapped", async () => {
    const update: Update = {
      update_id: 900000001,
      my_chat_member: {
        chat: CHAT,
        from: { id: 5550001, is_bot: false, first_name: "Rustam" },
        date: unix(NOW),
        old_chat_member: { status: "left", user: BOT_INFO },
        new_chat_member: { status: "member", user: BOT_INFO },
      },
    };
    await bot.handleUpdate(update);
    const [ch] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.companyId, companyId), eq(channels.externalId, String(CHAT.id))));
    expect(ch).toBeDefined();
    expect(ch!.customerId).toBeNull();
    expect(ch!.title).toBe(CHAT.title);
  });

  it("a broker's group message in a mapped chat creates a task and a suggested reply", async () => {
    await db
      .update(channels)
      .set({ customerId: apexId, chatType: "customer" })
      .where(and(eq(channels.companyId, companyId), eq(channels.externalId, String(CHAT.id))));

    const sent = new Date(NOW.getTime() + 60_000);
    const update: Update = {
      update_id: 900000002,
      message: {
        message_id: 42,
        from: {
          id: 5550002,
          is_bot: false,
          first_name: "Mike",
          last_name: "Carter",
          username: "mike_apex",
          language_code: "en",
        },
        chat: CHAT,
        date: unix(sent),
        text: "Need a reefer PU tomorrow 7am Dallas → Atlanta, can you cover?",
      },
    };
    await bot.handleUpdate(update);
    // Redelivery of the same update is harmless (idempotent ingestion).
    await bot.handleUpdate(update);

    const [ch] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.companyId, companyId), eq(channels.externalId, String(CHAT.id))));
    const rows = await db
      .select({ text: messages.text, side: participants.side, name: participants.displayName })
      .from(messages)
      .innerJoin(participants, eq(participants.id, messages.participantId))
      .where(eq(messages.channelId, ch!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.side).toBe("customer");
    expect(rows[0]!.name).toBe("Mike Carter");

    await analyzeCustomer(db, companyId, apexId, new Date(sent.getTime() + 10_000));

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.channelId, ch!.id)));
    expect(task!.kind).toBe("quote");
    expect(task!.status).toBe("received");
    expect(task!.title.en).toMatch(/Dallas → Atlanta/);

    const [s] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.channelId, ch!.id), eq(suggestions.status, "pending")));
    expect(s).toBeDefined();
    expect(s!.proposedText).toMatch(/Dallas → Atlanta/);
  });
});
