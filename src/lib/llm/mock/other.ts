// Offline stand-ins for the smaller LLM tasks. Deterministic, template-based.
import type { SignalKind, ChatType } from "@/lib/db/schema";
import type {
  ChannelMapping,
  DistilledRule,
  HandoffOut,
  OwnerDigest,
  WatchCriteriaOut,
} from "@/lib/llm/schemas";
import type {
  CriteriaInput,
  DigestInput,
  DistillInput,
  HandoffInput,
  MappingInput,
} from "@/lib/pipeline/types";
import { customerNameCore } from "@/lib/ingest/ingest";
import { clock } from "@/lib/heuristics/extract";

const WHY: Record<SignalKind, { en: string; ru: string }> = {
  complaint: {
    en: "An unhappy broker quietly moves freight to other carriers; this is how loads are lost.",
    ru: "Недовольный брокер молча уводит грузы к другим перевозчикам — так теряются заказы.",
  },
  rude_tone: {
    en: "Rudeness to a broker damages the relationship you pay for; the broker remembers it, not the dispatcher.",
    ru: "Грубость брокеру портит отношения, за которые вы платите; брокер запомнит компанию, а не диспетчера.",
  },
  overdue: {
    en: "A missed promise costs trust and can delay payment on the load.",
    ru: "Сорванное обещание подрывает доверие и может задержать оплату за груз.",
  },
  no_ack: {
    en: "An unanswered request looks like we don't want the business.",
    ru: "Неотвеченный запрос выглядит так, будто нам не нужна эта работа.",
  },
  missing_deadline: {
    en: "A load that was acknowledged but never confirmed is likely lost to another carrier.",
    ru: "Груз, который подтвердили, но так и не закрыли, скорее всего ушёл к другому перевозчику.",
  },
  reply_needed: {
    en: "The customer is waiting for an answer right now.",
    ru: "Клиент прямо сейчас ждёт ответа.",
  },
  eta_not_forwarded: {
    en: "We had the answer internally, but the customer kept waiting — pure process loss.",
    ru: "Ответ у нас был внутри, а клиент продолжал ждать — чистая потеря на процессе.",
  },
  context_ignored: {
    en: "The team tells the customer things that contradict what we already know.",
    ru: "Команда пишет клиенту то, что противоречит уже известной информации.",
  },
  customer_silent: {
    en: "A regular customer went quiet — check whether they moved to a competitor.",
    ru: "Постоянный клиент замолчал — стоит проверить, не ушёл ли он к конкуренту.",
  },
};

export function mockOwnerDigest(input: DigestInput): OwnerDigest {
  return {
    items: input.candidates.map((c) => ({
      signal_id: c.signalId,
      title: c.title,
      what_happened: c.reason,
      why_it_matters: WHY[c.kind],
    })),
  };
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}#]+/u)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

export function mockDistillRule(input: DistillInput): DistilledRule {
  let text: string | null = null;
  const reason = input.reason?.trim();
  if (reason && reason.length >= 6) {
    text = reason.replace(/\s+/g, " ").replace(/[.!]*$/, ".");
    text = text[0]!.toUpperCase() + text.slice(1);
  } else {
    // No reason given: learn only from recognizable additions.
    const added = (re: RegExp) => re.test(input.final) && !re.test(input.proposed);
    const tz = /\b(CST|CDT|CT|EST|EDT|ET|PST|PDT|PT|MST|MDT|UTC)\b/.exec(input.final)?.[1];
    const lessons: string[] = [];
    if (tz && added(new RegExp(`\\b${tz}\\b`))) lessons.push(`give times in ${tz}`);
    if (added(/truck\s*#?\s*\d{2,4}/i)) lessons.push("include the truck number");
    if (added(/\n—|^—|regards|thanks,\s*\w+$/im))
      lessons.push("sign messages with the dispatcher's name");
    if (lessons.length) {
      const who = input.customerName ? `For ${input.customerName}: ` : "";
      text = `${who}${lessons.join(" and ")}.`;
    }
  }
  if (!text) return { rule: null, merge_with_rule_id: null };
  const companyWide =
    /\b(all customers|every customer|everyone|always|company[- ]wide)\b|всем клиентам|всегда|для всех/i.test(
      reason ?? "",
    );
  const scope: "company" | "customer" | "chat_type" = companyWide
    ? "company"
    : input.customerName
      ? "customer"
      : "chat_type";
  const similar = input.existingRules.find(
    (r) => r.scope === scope && jaccard(r.text, text!) >= 0.5,
  );
  return { rule: { scope, rule_text: text }, merge_with_rule_id: similar?.id ?? null };
}

export function mockChannelMapping(input: MappingInput): ChannelMapping {
  const hay = `${input.title} ${input.firstMessages.map((m) => m.text).join(" ")}`.toLowerCase();
  const title = input.title.toLowerCase();
  let chatType: ChatType = "customer";
  if (/fleet|флот|driver|водител|трак|truck/.test(title)) chatType = "fleet";
  else if (/dispatch|internal|team|диспетч|внутр|команд/.test(title)) chatType = "internal";
  else if (/billing|invoice|ap\b|accounting|оплат|счет|счёт|бухгалт/.test(title))
    chatType = "billing";
  else if (/support|поддерж/.test(title)) chatType = "support";
  const match = input.customers.find((c) => {
    const core = customerNameCore(c.name);
    return core.length >= 3 && hay.includes(core);
  });
  let newName: string | null = null;
  if (!match && chatType === "customer") {
    const m = /^(.+?)\s*(?:↔|<->|-|–|—|\/|x|&)\s*/i.exec(input.title);
    newName = m?.[1]?.trim() || input.title;
  }
  return {
    customer_id: chatType === "fleet" ? null : (match?.id ?? null),
    new_customer_name: chatType === "fleet" ? null : newName,
    chat_type: chatType,
    confidence: match ? 0.8 : 0.5,
    reason: match
      ? `Title/messages mention “${match.name}”; looks like a ${chatType} chat.`
      : `Title “${input.title}” looks like a ${chatType} chat${newName ? ` with a new customer “${newName}”` : ""}.`,
  };
}

const CRITERIA_MAP: { re: RegExp; kinds: SignalKind[]; en: string; ru: string; sev: number }[] = [
  {
    re: /confirm|ack|подтвер|ответ|respond|reply|ignor|игнор|unanswer|без ответа/i,
    kinds: ["no_ack", "reply_needed"],
    en: "A customer request sits without an answer",
    ru: "Запрос клиента остаётся без ответа",
    sev: 3,
  },
  {
    re: /deadline|late|overdue|срок|опозд|просроч|on time|вовремя|pod|eta/i,
    kinds: ["overdue", "missing_deadline", "eta_not_forwarded"],
    en: "A promised deadline or ETA is missed",
    ru: "Сорван обещанный срок или ETA",
    sev: 3,
  },
  {
    re: /rude|tone|polite|груб|хам|тон|вежлив|оскорб|профессионал/i,
    kinds: ["rude_tone"],
    en: "Anyone on the team is rude or unprofessional with a customer",
    ru: "Кто-то из команды грубит клиенту или ведёт себя непрофессионально",
    sev: 3,
  },
  {
    re: /complain|unhappy|angry|жалоб|недовол|злит|уход|leave|lose|потер/i,
    kinds: ["complaint", "customer_silent"],
    en: "A customer complains or goes quiet",
    ru: "Клиент жалуется или пропадает",
    sev: 3,
  },
  {
    re: /context|history|истори|контекст|logic|логич/i,
    kinds: ["context_ignored"],
    en: "The team answers without the context of the other chats",
    ru: "Команда отвечает без учёта контекста других чатов",
    sev: 3,
  },
];

export function mockWatchCriteria(input: CriteriaInput): WatchCriteriaOut {
  const all = input.answers.join(" \n ");
  const items: WatchCriteriaOut["items"] = [];
  for (const c of CRITERIA_MAP) {
    if (c.re.test(all))
      items.push({
        text: input.lang === "ru" ? c.ru : c.en,
        kinds: c.kinds,
        customer_ids: [],
        min_severity: c.sev,
      });
  }
  const named = input.customers.filter((c) => {
    const core = customerNameCore(c.name);
    return core.length >= 3 && all.toLowerCase().includes(core);
  });
  if (named.length) {
    items.push({
      text:
        input.lang === "ru"
          ? `Любые проблемы с ключевыми клиентами: ${named.map((c) => c.name).join(", ")}`
          : `Any problem with key customers: ${named.map((c) => c.name).join(", ")}`,
      kinds: [
        "reply_needed",
        "no_ack",
        "missing_deadline",
        "overdue",
        "eta_not_forwarded",
        "rude_tone",
        "complaint",
        "context_ignored",
      ],
      customer_ids: named.map((c) => c.id),
      min_severity: 2,
    });
  }
  if (!items.length) {
    items.push({
      text: input.lang === "ru" ? CRITERIA_MAP[0]!.ru : CRITERIA_MAP[0]!.en,
      kinds: CRITERIA_MAP[0]!.kinds,
      customer_ids: [],
      min_severity: 3,
    });
  }
  return { items };
}

export function mockHandoff(input: HandoffInput): HandoffOut {
  const tz = input.timezone;
  return {
    channels: input.channels.map((ch) => {
      const msgs = input.messages.filter((m) => m.channelId === ch.id);
      const tasks = input.tasks.filter(
        (t) => t.channelId === ch.id || (!t.channelId && ch.chatType === "customer"),
      );
      const last = msgs.at(-1);
      const promises = msgs.filter(
        (m) =>
          m.side === "employee" &&
          /\b(will|we'll|by \d|within)\b|обеща|сделаем|скинет/i.test(m.text),
      );
      const overdue = tasks.filter((t) => t.deadlineAt && t.deadlineAt < input.now);
      const summary = input.dailySummaries.at(-1)?.summary;
      return {
        channel_id: ch.id,
        what_happened: {
          en: `${msgs.length} recent messages.${last ? ` Last: ${last.senderName} at ${clock(last.sentAt, tz)} — “${last.text.slice(0, 120)}”.` : ""}${summary && ch.chatType === "customer" ? ` ${summary}` : ""}`,
          ru: `${msgs.length} последних сообщений.${last ? ` Последнее: ${last.senderName} в ${clock(last.sentAt, tz, "ru")} — «${last.text.slice(0, 120)}».` : ""}`,
        },
        promises_made: {
          en: promises.length
            ? promises
                .slice(-3)
                .map((m) => `“${m.text.slice(0, 100)}” (${clock(m.sentAt, tz)})`)
                .join("; ")
            : "No explicit promises.",
          ru: promises.length
            ? promises
                .slice(-3)
                .map((m) => `«${m.text.slice(0, 100)}» (${clock(m.sentAt, tz)})`)
                .join("; ")
            : "Явных обещаний нет.",
        },
        risks: {
          en: overdue.length
            ? `Overdue: ${overdue.map((t) => t.title).join("; ")}.`
            : tasks.length
              ? `${tasks.length} open task(s) in this chat.`
              : "No open risks.",
          ru: overdue.length
            ? `Просрочено: ${overdue.map((t) => t.title).join("; ")}.`
            : tasks.length
              ? `Открытых задач в чате: ${tasks.length}.`
              : "Открытых рисков нет.",
        },
        next_steps: {
          en: tasks.length
            ? tasks
                .map(
                  (t) =>
                    `Close “${t.title}” (now: ${t.status.replace("_", " ")}${t.deadlineAt ? `, due ${clock(t.deadlineAt, tz)}` : ""}).`,
                )
                .join(" ")
            : ch.chatType === "customer"
              ? `Introduce yourself to ${input.customer.name} as the new contact.`
              : "Nothing pending here; watch it for fleet updates on this customer's loads.",
          ru: tasks.length
            ? tasks
                .map(
                  (t) =>
                    `Закрыть «${t.title}» (сейчас: ${t.status.replace("_", " ")}${t.deadlineAt ? `, срок ${clock(t.deadlineAt, tz, "ru")}` : ""}).`,
                )
                .join(" ")
            : ch.chatType === "customer"
              ? `Представиться ${input.customer.name} как новый контакт.`
              : "Здесь ничего не висит; следите за обновлениями флота по грузам клиента.",
        },
      };
    }),
  };
}
