// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md
// Pattern from Iva's long-polling bridge (scripts/poller, docs/deploy.md): no webhook, no
// public URL; the bot pulls updates, and ingestion is idempotent so a redelivered update
// is harmless.
import { Bot, GrammyError, HttpError } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, companies, systemState } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ingestMessage, ANALYSIS_DEBOUNCE_MS } from "@/lib/ingest/ingest";
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

/** Liveness of the long poll, written to system_state for Settings / demo:check. */
export type BotHealth = {
  lastPollAt: number | null;
  lastUpdateAt: number | null;
  lastError: string | null;
  firstPollLogged: boolean;
};

export function createBot(
  db: Db,
  opts: { token?: string; botInfo?: UserFromGetMe; health?: BotHealth } = {},
): Bot | null {
  const token = opts.token ?? env().telegram.token;
  if (!token) return null;
  const { businessEnabled } = env().telegram;
  const bot = new Bot(token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);
  const health = opts.health;

  if (health) {
    // Every successful getUpdates round-trip proves the long poll is alive.
    bot.api.config.use(async (prev, method, payload, signal) => {
      const res = await prev(method, payload, signal);
      if (method === "getUpdates" && res.ok) {
        health.lastPollAt = Date.now();
        if (!health.firstPollLogged) {
          health.firstPollLogged = true;
          console.log("[telegram] getUpdates ok — long poll healthy");
        }
      }
      return res;
    });
    bot.use(async (_ctx, next) => {
      health.lastUpdateAt = Date.now();
      await next();
    });
  }

  const handle = async (msg: TgMessage, business: boolean) => {
    const normalized = business ? normalizeTelegramBusiness(msg) : normalizeTelegramGroup(msg);
    if (!normalized) return;
    const companyId = await resolveBotCompanyId(db);
    if (!companyId) {
      console.warn("[telegram] no company in the database yet — message ignored");
      return;
    }
    // Live demo: a message typed in Telegram must show up in ~15 s, so debounce less.
    const res = await ingestMessage(db, companyId, normalized, {
      debounceMs: env().demoMode ? 5_000 : ANALYSIS_DEBOUNCE_MS,
    });
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

export type RunningBot = {
  bot: Bot;
  health: BotHealth;
  /** Resolves when polling stops (error or stop()). */
  done: Promise<void>;
  stop: () => Promise<void>;
  persist: () => Promise<void>;
};

export async function startBot(db: Db): Promise<RunningBot | null> {
  const health: BotHealth = {
    lastPollAt: null,
    lastUpdateAt: null,
    lastError: null,
    firstPollLogged: false,
  };
  const bot = createBot(db, { health });
  if (!bot) {
    const placeholder = env().warnings.find((w) => w.startsWith("TELEGRAM_BOT_TOKEN"));
    console.log(
      placeholder
        ? `[telegram] ${placeholder}`
        : "[telegram] TELEGRAM_BOT_TOKEN not set — live Telegram ingestion disabled",
    );
    await saveBotState(db, { configured: false, placeholder: Boolean(placeholder) });
    return null;
  }
  // Health check 1: getMe proves the token and tells whether group privacy is off.
  const me = await bot.api.getMe();
  bot.botInfo = me;
  console.log(
    `[telegram] getMe ok: @${me.username} (reads all group messages: ${me.can_read_all_group_messages ? "yes" : "NO"})`,
  );
  const startedAt = new Date().toISOString();
  const persist = () =>
    saveBotState(db, {
      configured: true,
      username: me.username,
      canReadAllGroupMessages: me.can_read_all_group_messages ?? false,
      businessEnabled: env().telegram.businessEnabled,
      startedAt,
      pid: process.pid,
      lastPollAt: health.lastPollAt ? new Date(health.lastPollAt).toISOString() : null,
      lastUpdateAt: health.lastUpdateAt ? new Date(health.lastUpdateAt).toISOString() : null,
      lastError: health.lastError,
    });
  await persist();
  if (!me.can_read_all_group_messages) {
    console.warn(
      "[telegram] group privacy is ON — the bot will only see commands/mentions. Disable it: @BotFather → /setprivacy → Disable",
    );
  }
  const allowed = ["message", "my_chat_member"] as const;
  // Health check 2: every getUpdates round-trip (see createBot) updates lastPollAt.
  const done = bot
    .start({
      allowed_updates: env().telegram.businessEnabled
        ? [...allowed, "business_message", "business_connection"]
        : [...allowed],
      onStart: () => console.log(`[telegram] long polling as @${me.username}`),
    })
    .catch(async (err: unknown) => {
      // e.g. 409 Conflict: another process polls this token. Never crash the worker for it.
      health.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] polling stopped: ${health.lastError}`);
      await persist().catch(() => {});
    });
  return {
    bot,
    health,
    done,
    persist,
    stop: async () => {
      await bot.stop().catch(() => {});
    },
  };
}
