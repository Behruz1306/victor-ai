import type { ChatType, Side, Source } from "@/lib/db/schema";

/** The one shape every source produces before `ingestMessage()`. */
export type NormalizedMessage = {
  source: Source;
  channelExternalId: string;
  channelTitle: string;
  messageExternalId: string;
  senderExternalId: string;
  senderName: string;
  text: string;
  sentAt: Date;
  replyTo?: string | null;
  senderIsBot?: boolean;
  raw?: Record<string, unknown>;
};

/** Cyrillic share of letters decides RU vs EN; good enough for EN/RU/UZ-latin chats. */
export function detectLang(text: string): "ru" | "en" {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return "en";
  const cyr = letters.filter((c) => /[Ѐ-ӿ]/.test(c)).length;
  return cyr / letters.length > 0.3 ? "ru" : "en";
}

/**
 * Who is speaking. Linked employees are always `employee`; otherwise unknown senders in a
 * customer chat are the customer, and in internal/fleet/billing/support chats they are staff.
 */
export function sideFor(opts: {
  linkedUser: boolean;
  isBot?: boolean;
  chatType: ChatType | null;
}): Side {
  if (opts.isBot) return "bot";
  if (opts.linkedUser) return "employee";
  if (!opts.chatType) return "unknown";
  return opts.chatType === "customer" ? "customer" : "employee";
}

// ── Telegram ────────────────────────────────────────────────────────────────

/** Minimal structural type of the Telegram Message fields we read (grammY-compatible). */
export type TgMessage = {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
    title?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  sender_chat?: { id: number; title?: string };
  text?: string;
  caption?: string;
  photo?: unknown[];
  document?: { file_name?: string };
  voice?: unknown;
  video?: unknown;
  sticker?: { emoji?: string };
  location?: unknown;
  reply_to_message?: { message_id: number };
  business_connection_id?: string;
};

function displayName(from: TgMessage["from"], fallback: string): string {
  if (!from) return fallback;
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return full || (from.username ? `@${from.username}` : fallback);
}

/** Text we store for a Telegram message: text, or caption plus a marker for media. */
export function telegramText(m: TgMessage): string | null {
  const marker = m.document
    ? `[document: ${m.document.file_name ?? "file"}]`
    : m.photo
      ? "[photo]"
      : m.voice
        ? "[voice message]"
        : m.video
          ? "[video]"
          : m.location
            ? "[location]"
            : m.sticker
              ? `[sticker ${m.sticker.emoji ?? ""}]`.replace(" ]", "]")
              : null;
  const body = (m.text ?? m.caption ?? "").trim();
  if (!body && !marker) return null;
  return [body, marker].filter(Boolean).join(" ");
}

/** Group/supergroup message → NormalizedMessage. Returns null for service messages. */
export function normalizeTelegramGroup(m: TgMessage): NormalizedMessage | null {
  if (m.chat.type !== "group" && m.chat.type !== "supergroup") return null;
  const text = telegramText(m);
  if (!text) return null;
  const senderId = m.from
    ? String(m.from.id)
    : m.sender_chat
      ? `chat:${m.sender_chat.id}`
      : "unknown";
  return {
    source: "telegram",
    channelExternalId: String(m.chat.id),
    channelTitle: m.chat.title ?? `Telegram group ${m.chat.id}`,
    messageExternalId: String(m.message_id),
    senderExternalId: senderId,
    senderName: m.from ? displayName(m.from, senderId) : (m.sender_chat?.title ?? senderId),
    senderIsBot: Boolean(m.from?.is_bot),
    text,
    sentAt: new Date(m.date * 1000),
    replyTo: m.reply_to_message ? String(m.reply_to_message.message_id) : null,
    raw: { chat_type: m.chat.type },
  };
}

/**
 * Telegram Business (connected bot) 1:1 message → NormalizedMessage. Channel id is scoped
 * by the business connection so two accounts talking to the same customer stay separate.
 */
export function normalizeTelegramBusiness(m: TgMessage): NormalizedMessage | null {
  if (!m.business_connection_id || m.chat.type !== "private") return null;
  const text = telegramText(m);
  if (!text) return null;
  const customerName =
    [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ") ||
    (m.chat.username ? `@${m.chat.username}` : String(m.chat.id));
  const senderId = m.from ? String(m.from.id) : "unknown";
  return {
    source: "telegram",
    channelExternalId: `biz:${m.business_connection_id}:${m.chat.id}`,
    channelTitle: `1:1 ${customerName}`,
    messageExternalId: String(m.message_id),
    senderExternalId: senderId,
    senderName: displayName(m.from, senderId),
    text,
    sentAt: new Date(m.date * 1000),
    replyTo: m.reply_to_message ? String(m.reply_to_message.message_id) : null,
    raw: { business_connection_id: m.business_connection_id },
  };
}

/** "Speaker: text" lines from an uploaded call transcript. */
export function parseTranscript(content: string): { speaker: string; text: string }[] {
  const out: { speaker: string; text: string }[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(?:\[[^\]]*\]\s*)?([^:]{1,60}):\s*(.+)$/);
    if (m) out.push({ speaker: m[1]!.trim(), text: m[2]!.trim() });
    else if (out.length) out[out.length - 1]!.text += " " + trimmed;
  }
  return out;
}
