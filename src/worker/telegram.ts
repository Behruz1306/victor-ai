// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md
// Pattern from Iva's long-polling bridge (scripts/poller, docs/deploy.md): no webhook, no
// public URL; the bot pulls updates, and ingestion is idempotent so a redelivered update
// is harmless.
import { Bot, GrammyError, HttpError } from "grammy";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, companies, systemState } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ingestMessage } from "@/lib/ingest/ingest";
import {
  normalizeTelegramBusiness,
  normalizeTelegramGroup,
  type TgMessage,
} from "@/lib/ingest/normalize";

export async function resolveBotCompanyId(db: Db): Promise<string | null> {
  const configured = env().telegram.companyId;
  if (configured) return configured;
  const [c] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(asc(companies.createdAt))
    .limit(1);
  return c?.id ?? null;
}

export async function saveBotState(db: Db, value: Record<string, unknown>): Promise<void> {
  await db
    .insert(systemState)
    .values({ key: "telegram_bot", value })
    .onConflictDoUpdate({ target: systemState.key, set: { value, updatedAt: sql`now()` } });
}

export function createBot(db: Db): Bot | null {
  const { token, businessEnabled } = env().telegram;
  if (!token) return null;
  const bot = new Bot(token);

  const handle = async (msg: TgMessage, business: boolean) => {
    const normalized = business ? normalizeTelegramBusiness(msg) : normalizeTelegramGroup(msg);
    if (!normalized) return;
    const companyId = await resolveBotCompanyId(db);
    if (!companyId) {
      console.warn("[telegram] no company in the database yet — message ignored");
      return;
    }
    const res = await ingestMessage(db, companyId, normalized);
    // Never log message bodies at info level (SECURITY.md).
    console.log(
      `[telegram] ingested chat=${normalized.channelExternalId} msg=${normalized.messageExternalId} new=${res.inserted} flagged=${res.flagged}`,
    );
  };

  bot.on("message", (ctx) => handle(ctx.message as unknown as TgMessage, false));
  if (businessEnabled) {
    bot.on("business_message", (ctx) => handle(ctx.businessMessage as unknown as TgMessage, true));
    bot.on("business_connection", (ctx) =>
      console.log(
        `[telegram] business connection ${ctx.businessConnection.id} enabled=${ctx.businessConnection.is_enabled}`,
      ),
    );
  }
  // Bot added to a group → the chat shows up in Sources as unmapped right away.
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.myChatMember.chat as { id: number; type: string; title?: string };
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    const status = ctx.myChatMember.new_chat_member.status;
    const companyId = await resolveBotCompanyId(db);
    if (!companyId) return;
    if (status === "member" || status === "administrator") {
      await db
        .insert(channels)
        .values({
          companyId,
          source: "telegram",
          externalId: String(chat.id),
          title: chat.title ?? String(chat.id),
        })
        .onConflictDoUpdate({
          target: [channels.companyId, channels.source, channels.externalId],
          set: { active: true, title: chat.title ?? String(chat.id) },
        });
      console.log(`[telegram] added to group ${chat.id}`);
    } else if (status === "left" || status === "kicked") {
      await db
        .update(channels)
        .set({ active: false })
        .where(
          and(
            eq(channels.companyId, companyId),
            eq(channels.source, "telegram"),
            eq(channels.externalId, String(chat.id)),
          ),
        );
    }
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error(`[telegram] API error: ${e.description}`);
    else if (e instanceof HttpError) console.error("[telegram] network error, grammY will retry");
    else console.error("[telegram] handler error", e instanceof Error ? e.message : e);
  });
  return bot;
}

export async function startBot(db: Db): Promise<Bot | null> {
  const bot = createBot(db);
  if (!bot) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — live Telegram ingestion disabled");
    await saveBotState(db, { configured: false });
    return null;
  }
  const me = await bot.api.getMe();
  await saveBotState(db, {
    configured: true,
    username: me.username,
    canReadAllGroupMessages: me.can_read_all_group_messages ?? false,
    businessEnabled: env().telegram.businessEnabled,
    startedAt: new Date().toISOString(),
  });
  if (!me.can_read_all_group_messages) {
    console.warn(
      "[telegram] group privacy is ON — the bot will only see commands/mentions. Disable it: @BotFather → /setprivacy → Disable",
    );
  }
  const allowed = ["message", "my_chat_member"] as const;
  void bot.start({
    allowed_updates: env().telegram.businessEnabled
      ? [...allowed, "business_message", "business_connection"]
      : [...allowed],
    onStart: () => console.log(`[telegram] long polling as @${me.username}`),
  });
  return bot;
}
