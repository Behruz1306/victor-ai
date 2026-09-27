// Shared JSON shapes stored in jsonb columns. Kept free of DB/runtime imports so both
// the web app, the worker and pure pipeline functions can use them.

export type Lang = "en" | "ru";
export const LANGS: readonly Lang[] = ["en", "ru"] as const;

/** Human-facing generated text, stored in both UI languages. */
export type L10n = { en: string; ru: string };

export type SlaConfig = {
  /** Customer request must be acknowledged within this many minutes. */
  ackMinutes: number;
  /** ETA request must be answered within this many minutes. */
  etaAnswerMinutes: number;
  /** Acknowledged / in-progress task must get a deadline within this many minutes. */
  deadlineRequiredMinutes: number;
  /** Grace after a deadline before it counts as overdue. */
  deadlineGraceMinutes: number;
  /** Days without any customer message before `customer_silent`. */
  customerSilentDays: number;
  /** Null = 24/7 (default for trucking dispatch). */
  businessHours: { start: string; end: string; days: number[] } | null;
};

export const DEFAULT_SLA: SlaConfig = {
  ackMinutes: 15,
  etaAnswerMinutes: 60,
  deadlineRequiredMinutes: 120,
  deadlineGraceMinutes: 0,
  customerSilentDays: 7,
  businessHours: null,
};

export type WatchCriterion = {
  id: string;
  /** Plain-language criterion as the owner would say it. */
  text: string;
  /** Structured form: which signal kinds it covers. */
  kinds: string[];
  /** Optional: only these customers. */
  customerIds: string[];
  minSeverity: number;
};

export type WatchCriteria = { items: WatchCriterion[]; answers?: string[]; updatedAt?: string };

export type CompanySettings = {
  sendMode: "copy" | "bot";
  retentionDays: number;
  consentText: string;
  onboardingDone: boolean;
  /** Prefix sends from the bot with the dispatcher's name. */
  signWithName: boolean;
};

export const DEFAULT_CONSENT_TEXT =
  "This chat is monitored by Victor AI, an AI assistant that helps our team handle your requests on time. A person reviews every message before it is sent.";

export type UsedContext = {
  /** Message ids from the timeline that informed the suggestion. */
  messageIds: string[];
  /** Playbook rule ids applied. */
  ruleIds: string[];
};

export type DigestItem = {
  signalId: string;
  kind: string;
  severity: number;
  customerId: string | null;
  customerName: string | null;
  taskId: string | null;
  channelId: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  evidenceQuote: string | null;
  title: L10n;
  whyItMatters: L10n;
  whatHappened: L10n;
  score: number;
};

export type HandoffBrief = {
  channelId: string;
  channelTitle: string;
  chatType: string;
  customerId: string;
  customerName: string;
  whatHappened: L10n;
  openTasks: { taskId: string; title: L10n; status: string; deadlineAt: string | null }[];
  promisesMade: L10n;
  risks: L10n;
  nextSteps: L10n;
};

export type MappingProposal = {
  customerId: string | null;
  customerName: string | null;
  chatType: string;
  confidence: number;
  reason: string;
};

export function l10n(en: string, ru?: string): L10n {
  return { en, ru: ru ?? en };
}

export function pick(text: L10n | null | undefined, lang: Lang): string {
  if (!text) return "";
  return text[lang] || text.en || text.ru || "";
}
