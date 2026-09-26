// SLA engine: a pure function of timestamps. Decides which timestamp-based signals should be
// open right now; the DB layer (sla-apply.ts) opens, updates and resolves them to match.
import type { ChatType, SignalKind, TaskKind, TaskStatus } from "@/lib/db/schema";
import type { L10n, SlaConfig } from "@/lib/types";
import { localParts } from "@/lib/time";

export type SlaTask = {
  id: string;
  customerId: string;
  customerName: string;
  channelId: string | null;
  kind: TaskKind;
  status: TaskStatus;
  title: L10n;
  requestedAt: Date;
  requestQuote: string | null;
  requestMessageId: string | null;
  ackAt: Date | null;
  ackQuote: string | null;
  lastEventAt: Date;
  deadlineAt: Date | null;
  responsibleUserId: string | null;
  /** An open AI signal already explains this task more precisely (eta_not_forwarded). */
  hasEtaNotForwarded: boolean;
};

export type SlaChannel = {
  id: string;
  customerId: string;
  customerName: string;
  chatType: ChatType;
  title: string;
  responsibleUserId: string | null;
  lastMessage: {
    id: string;
    side: string;
    sentAt: Date;
    text: string;
    createdTaskStatus: TaskStatus | null;
    /** Closing pleasantry ("Perfect, thank you!") that needs no reply. */
    closing: boolean;
  } | null;
};

export type SlaCustomer = {
  id: string;
  name: string;
  responsibleUserId: string | null;
  lastCustomerMessageAt: Date | null;
  messageCount: number;
};

export type DesiredSignal = {
  dedupeKey: string;
  kind: SignalKind;
  severity: number;
  customerId: string;
  channelId: string | null;
  taskId: string | null;
  responsibleUserId: string | null;
  title: L10n;
  reason: L10n;
  evidenceQuote: string | null;
  evidenceMessageId: string | null;
};

export type TaskPatch = { taskId: string; stuckReason: L10n | null; risk: number };

export type SlaInput = {
  now: Date;
  timezone: string;
  sla: SlaConfig;
  tasks: SlaTask[];
  channels: SlaChannel[];
  customers: SlaCustomer[];
};

const OPEN = new Set<TaskStatus>(["received", "acknowledged", "in_progress", "deadline_set"]);

/** Minutes between two instants counting only business hours (null = 24/7). */
export function businessMinutes(from: Date, to: Date, sla: SlaConfig, tz: string): number {
  const total = (to.getTime() - from.getTime()) / 60000;
  if (total <= 0) return 0;
  const bh = sla.businessHours;
  if (!bh) return total;
  const [sh, sm] = bh.start.split(":").map(Number);
  const [eh, em] = bh.end.split(":").map(Number);
  const startMin = sh! * 60 + sm!;
  const endMin = eh! * 60 + em!;
  let minutes = 0;
  // Walk in 15-minute steps: precise enough for SLA badges and bounded (≤ 30 days).
  const step = 15;
  const cap = Math.min(total, 30 * 24 * 60);
  for (let t = 0; t < cap; t += step) {
    const p = localParts(new Date(from.getTime() + t * 60000), tz);
    const m = p.h * 60 + p.min;
    if (bh.days.includes(p.weekday) && m >= startMin && m < endMin)
      minutes += Math.min(step, cap - t);
  }
  return minutes;
}

function fmt(minutes: number, lang: "en" | "ru"): string {
  const m = Math.round(minutes);
  if (m < 60) return lang === "ru" ? `${m} мин` : `${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return lang === "ru" ? `${h} ч` : `${h} h`;
  const d = Math.round(h / 2.4) / 10;
  return lang === "ru" ? `${d} дн` : `${d} d`;
}

function clip(s: string | null, n = 240): string | null {
  if (!s) return null;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function evaluateSla(input: SlaInput): { signals: DesiredSignal[]; patches: TaskPatch[] } {
  const { now, sla, timezone: tz } = input;
  const signals: DesiredSignal[] = [];
  const patches = new Map<string, TaskPatch>();
  const elapsed = (from: Date) => businessMinutes(from, now, sla, tz);
  const patch = (taskId: string, reason: L10n, severity: number) => {
    const risk = Math.max(0, Math.min(3, severity - 1));
    const cur = patches.get(taskId);
    if (!cur || risk > cur.risk) patches.set(taskId, { taskId, stuckReason: reason, risk });
  };

  for (const t of input.tasks) {
    if (!OPEN.has(t.status)) continue;
    const base = {
      customerId: t.customerId,
      channelId: t.channelId,
      taskId: t.id,
      responsibleUserId: t.responsibleUserId,
    };

    // 1. Request not acknowledged.
    if (t.status === "received") {
      const waited = elapsed(t.requestedAt);
      if (waited > sla.ackMinutes) {
        const severity = Math.min(5, 3 + (waited > 240 ? 1 : 0));
        const reason: L10n = {
          en: `${t.customerName} asked ${fmt(waited, "en")} ago and nobody answered (SLA ${sla.ackMinutes} min).`,
          ru: `${t.customerName} написал ${fmt(waited, "ru")} назад, ответа нет (SLA ${sla.ackMinutes} мин).`,
        };
        signals.push({
          ...base,
          dedupeKey: `no_ack:${t.id}`,
          kind: "no_ack",
          severity,
          title: t.title,
          reason,
          evidenceQuote: clip(t.requestQuote),
          evidenceMessageId: t.requestMessageId,
        });
        patch(t.id, reason, severity);
      }
      continue;
    }

    // 2. Deadline (explicit, or implicit for ETA requests) passed.
    const implicitEta =
      t.kind === "eta_update" && !t.deadlineAt
        ? new Date(t.requestedAt.getTime() + sla.etaAnswerMinutes * 60000)
        : null;
    const due = t.deadlineAt ?? implicitEta;
    if (due && now.getTime() > due.getTime() + sla.deadlineGraceMinutes * 60000) {
      if (t.hasEtaNotForwarded) continue; // the AI signal already says exactly what's wrong
      const late = (now.getTime() - due.getTime()) / 60000;
      const severity = late > 24 * 60 ? 5 : 4;
      const dueText = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        weekday: "short",
      }).format(due);
      const dueTextRu = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        weekday: "short",
      }).format(due);
      const reason: L10n = t.deadlineAt
        ? {
            en: `Promised by ${dueText}; ${fmt(late, "en")} late and still not delivered.`,
            ru: `Обещали к ${dueTextRu}; просрочено на ${fmt(late, "ru")}, результата нет.`,
          }
        : {
            en: `ETA request from ${fmt(elapsed(t.requestedAt), "en")} ago still unanswered (SLA ${sla.etaAnswerMinutes} min).`,
            ru: `Запрос ETA ${fmt(elapsed(t.requestedAt), "ru")} назад так и не получил ответа (SLA ${sla.etaAnswerMinutes} мин).`,
          };
      signals.push({
        ...base,
        dedupeKey: `overdue:${t.id}`,
        kind: "overdue",
        severity,
        title: t.title,
        reason,
        evidenceQuote: clip(t.ackQuote ?? t.requestQuote),
        evidenceMessageId: t.requestMessageId,
      });
      patch(t.id, reason, severity);
      continue;
    }

    // 3. Acknowledged / in progress but no deadline and no progress.
    if (
      (t.status === "acknowledged" || t.status === "in_progress") &&
      !t.deadlineAt &&
      t.kind !== "eta_update"
    ) {
      const since = t.ackAt ?? t.lastEventAt;
      const idle = elapsed(since);
      if (idle > sla.deadlineRequiredMinutes) {
        const severity = Math.min(4, 2 + (idle > 240 ? 1 : 0) + (idle > 720 ? 1 : 0));
        const reason: L10n = {
          en: `${t.status === "acknowledged" ? "Acknowledged" : "In progress"} ${fmt(idle, "en")} ago${t.ackQuote ? ` (“${clip(t.ackQuote, 60)}”)` : ""}; no confirmation or deadline since.`,
          ru: `${t.status === "acknowledged" ? "Подтверждено" : "В работе"} ${fmt(idle, "ru")} назад${t.ackQuote ? ` («${clip(t.ackQuote, 60)}»)` : ""}; с тех пор ни подтверждения, ни срока.`,
        };
        signals.push({
          ...base,
          dedupeKey: `missing_deadline:${t.id}`,
          kind: "missing_deadline",
          severity,
          title: t.title,
          reason,
          evidenceQuote: clip(t.requestQuote),
          evidenceMessageId: t.requestMessageId,
        });
        patch(t.id, reason, severity);
      }
    }
  }

  // 4. Customer chats where the customer spoke last and waits.
  for (const c of input.channels) {
    if (!["customer", "billing", "support"].includes(c.chatType) || !c.lastMessage) continue;
    const lm = c.lastMessage;
    if (lm.side !== "customer" || lm.closing) continue;
    if (lm.createdTaskStatus === "received") continue; // covered by no_ack
    const waited = elapsed(lm.sentAt);
    if (waited <= sla.ackMinutes) continue;
    const severity = Math.min(4, 3 + (waited > 240 ? 1 : 0));
    signals.push({
      dedupeKey: `reply_needed:${c.id}`,
      kind: "reply_needed",
      severity,
      customerId: c.customerId,
      channelId: c.id,
      taskId: null,
      responsibleUserId: c.responsibleUserId,
      title: { en: `“${c.title}” is waiting for a reply`, ru: `«${c.title}» ждёт ответа` },
      reason: {
        en: `${c.customerName} wrote ${fmt(waited, "en")} ago and is still waiting for a reply.`,
        ru: `${c.customerName} написал ${fmt(waited, "ru")} назад и всё ещё ждёт ответа.`,
      },
      evidenceQuote: clip(lm.text),
      evidenceMessageId: lm.id,
    });
  }

  // 5. Regular customer went quiet.
  for (const cu of input.customers) {
    if (!cu.lastCustomerMessageAt || cu.messageCount < 5) continue;
    const days = (now.getTime() - cu.lastCustomerMessageAt.getTime()) / 86_400_000;
    if (days < sla.customerSilentDays) continue;
    signals.push({
      dedupeKey: `customer_silent:${cu.id}`,
      kind: "customer_silent",
      severity: 2,
      customerId: cu.id,
      channelId: null,
      taskId: null,
      responsibleUserId: cu.responsibleUserId,
      title: { en: `${cu.name} went quiet`, ru: `${cu.name} замолчал` },
      reason: {
        en: `No messages from ${cu.name} for ${Math.floor(days)} days.`,
        ru: `От ${cu.name} нет сообщений ${Math.floor(days)} дн.`,
      },
      evidenceQuote: null,
      evidenceMessageId: null,
    });
  }

  return { signals, patches: [...patches.values()] };
}
