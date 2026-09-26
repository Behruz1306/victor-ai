import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  L10n,
  SlaConfig,
  WatchCriteria,
  CompanySettings,
  UsedContext,
  DigestItem,
  HandoffBrief,
  MappingProposal,
} from "@/lib/types";

import {
  ROLES,
  CUSTOMER_KINDS,
  SOURCES,
  CHAT_TYPES,
  SIDES,
  TASK_KINDS,
  TASK_STATUSES,
  SIGNAL_KINDS,
  AUDIENCES,
  SUGGESTION_INTENTS,
  SUGGESTION_STATUSES,
  RULE_SCOPES,
  RULE_STATUSES,
  ACTORS,
} from "@/lib/constants";

export {
  ROLES,
  CUSTOMER_KINDS,
  SOURCES,
  CHAT_TYPES,
  SIDES,
  TASK_KINDS,
  TASK_STATUSES,
  SIGNAL_KINDS,
  AUDIENCES,
  SUGGESTION_INTENTS,
  SUGGESTION_STATUSES,
  RULE_SCOPES,
  RULE_STATUSES,
  ACTORS,
};

const id = () => uuid("id").primaryKey().defaultRandom();
const companyId = () =>
  uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  industry: text("industry").notNull().default("trucking"),
  watchCriteria: jsonb("watch_criteria").$type<WatchCriteria>().notNull().default({ items: [] }),
  sla: jsonb("sla").$type<SlaConfig>().notNull(),
  timezone: text("timezone").notNull().default("America/Chicago"),
  settings: jsonb("settings").$type<CompanySettings>().notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    team: text("team"),
    telegramUserId: text("telegram_user_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_company_idx").on(t.companyId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CUSTOMER_KINDS }).notNull().default("broker"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    brief: text("brief").notNull().default(""),
    briefUpdatedAt: timestamp("brief_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_company_idx").on(t.companyId),
    index("customers_assigned_idx").on(t.assignedUserId),
  ],
);

export const channels = pgTable(
  "channels",
  {
    id: id(),
    companyId: companyId(),
    source: text("source", { enum: SOURCES }).notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    chatType: text("chat_type", { enum: CHAT_TYPES }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    mappingProposal: jsonb("mapping_proposal").$type<MappingProposal | null>(),
    consentPostedAt: timestamp("consent_posted_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("channels_ext_uq").on(t.companyId, t.source, t.externalId),
    index("channels_company_idx").on(t.companyId),
    index("channels_customer_idx").on(t.customerId),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: id(),
    companyId: companyId(),
    source: text("source", { enum: SOURCES }).notNull(),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    side: text("side", { enum: SIDES }).notNull().default("unknown"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("participants_ext_uq").on(t.companyId, t.source, t.externalId),
    index("participants_company_idx").on(t.companyId),
    index("participants_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    companyId: companyId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    text: text("text").notNull(),
    lang: text("lang"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    replyToExternalId: text("reply_to_external_id"),
    untrustedFlag: boolean("untrusted_flag").notNull().default(false),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_ext_uq").on(t.channelId, t.externalId),
    index("messages_channel_sent_idx").on(t.channelId, t.sentAt),
    index("messages_company_idx").on(t.companyId),
    index("messages_participant_idx").on(t.participantId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    companyId: companyId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    title: jsonb("title").$type<L10n>().notNull(),
    kind: text("kind", { enum: TASK_KINDS }).notNull(),
    ref: text("ref"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("received"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    stuckReason: jsonb("stuck_reason").$type<L10n | null>(),
    risk: integer("risk").notNull().default(0),
    createdFromMessageId: uuid("created_from_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("tasks_company_status_idx").on(t.companyId, t.status),
    index("tasks_customer_idx").on(t.customerId),
    index("tasks_channel_idx").on(t.channelId),
    index("tasks_assignee_idx").on(t.assigneeUserId),
    index("tasks_created_from_idx").on(t.createdFromMessageId),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: id(),
    companyId: companyId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: TASK_STATUSES }),
    toStatus: text("to_status", { enum: TASK_STATUSES }).notNull(),
    evidenceMessageId: uuid("evidence_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    explanation: jsonb("explanation").$type<L10n>().notNull(),
    actor: text("actor", { enum: ACTORS }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("task_events_task_idx").on(t.taskId),
    index("task_events_company_idx").on(t.companyId),
    index("task_events_evidence_idx").on(t.evidenceMessageId),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: id(),
    companyId: companyId(),
    kind: text("kind", { enum: SIGNAL_KINDS }).notNull(),
    severity: integer("severity").notNull(),
    audience: text("audience", { enum: AUDIENCES }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    responsibleUserId: uuid("responsible_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: jsonb("title").$type<L10n>().notNull(),
    reason: jsonb("reason").$type<L10n>().notNull(),
    evidenceQuote: text("evidence_quote"),
    evidenceMessageId: uuid("evidence_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    dedupeKey: text("dedupe_key").notNull(),
    source: text("source", { enum: ["ai", "sla"] }).notNull(),
    status: text("status", { enum: ["open", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("signals_company_status_audience_idx").on(t.companyId, t.status, t.audience),
    uniqueIndex("signals_open_dedupe_uq")
      .on(t.companyId, t.dedupeKey)
      .where(sql`status = 'open'`),
    index("signals_customer_idx").on(t.customerId),
    index("signals_channel_idx").on(t.channelId),
    index("signals_task_idx").on(t.taskId),
    index("signals_responsible_idx").on(t.responsibleUserId),
    index("signals_evidence_idx").on(t.evidenceMessageId),
  ],
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: id(),
    companyId: companyId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    intent: text("intent", { enum: SUGGESTION_INTENTS }).notNull(),
    proposedText: text("proposed_text").notNull(),
    rationale: jsonb("rationale").$type<L10n>().notNull(),
    usedContext: jsonb("used_context").$type<UsedContext>().notNull(),
    status: text("status", { enum: SUGGESTION_STATUSES }).notNull().default("pending"),
    finalText: text("final_text"),
    editReason: text("edit_reason"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    sendMode: text("send_mode", { enum: ["copy", "bot"] }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("suggestions_company_status_idx").on(t.companyId, t.status),
    index("suggestions_channel_idx").on(t.channelId),
    index("suggestions_customer_idx").on(t.customerId),
    index("suggestions_task_idx").on(t.taskId),
    index("suggestions_decided_by_idx").on(t.decidedBy),
  ],
);

export const playbookRules = pgTable(
  "playbook_rules",
  {
    id: id(),
    companyId: companyId(),
    scope: text("scope", { enum: RULE_SCOPES }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    chatType: text("chat_type", { enum: CHAT_TYPES }),
    ruleText: text("rule_text").notNull(),
    examples: jsonb("examples").$type<string[]>().notNull().default([]),
    status: text("status", { enum: RULE_STATUSES }).notNull(),
    createdFrom: text("created_from").notNull().default("edit"),
    hits: integer("hits").notNull().default(0),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rules_company_status_idx").on(t.companyId, t.status),
    index("rules_customer_idx").on(t.customerId),
    index("rules_decided_by_idx").on(t.decidedBy),
  ],
);

export const digests = pgTable(
  "digests",
  {
    id: id(),
    companyId: companyId(),
    audience: text("audience", { enum: AUDIENCES }).notNull(),
    items: jsonb("items").$type<DigestItem[]>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("digests_company_idx").on(t.companyId, t.audience, t.generatedAt)],
);

export const handoffs = pgTable(
  "handoffs",
  {
    id: id(),
    companyId: companyId(),
    fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "set null" }),
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "set null" }),
    briefs: jsonb("briefs").$type<HandoffBrief[]>().notNull(),
    status: text("status", { enum: ["draft", "confirmed"] })
      .notNull()
      .default("draft"),
    createdAt: createdAt(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("handoffs_company_idx").on(t.companyId),
    index("handoffs_from_idx").on(t.fromUserId),
    index("handoffs_to_idx").on(t.toUserId),
  ],
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: id(),
    companyId: companyId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    summary: jsonb("summary").$type<L10n>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_summaries_uq").on(t.customerId, t.day),
    index("daily_summaries_company_idx").on(t.companyId),
  ],
);

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: id(),
    companyId: companyId(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("analysis_runs_company_idx").on(t.companyId, t.createdAt),
    index("analysis_runs_channel_idx").on(t.channelId),
    index("analysis_runs_customer_idx").on(t.customerId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    firstEnqueuedAt: timestamp("first_enqueued_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_pending_idx").on(t.status, t.runAfter),
    uniqueIndex("jobs_pending_dedupe_uq")
      .on(t.dedupeKey)
      .where(sql`status = 'pending' and dedupe_key is not null`),
    index("jobs_company_idx").on(t.companyId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    companyId: companyId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_company_idx").on(t.companyId, t.at), index("audit_user_idx").on(t.userId)],
);

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
export type PlaybookRule = typeof playbookRules.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Role = (typeof ROLES)[number];
export type ChatType = (typeof CHAT_TYPES)[number];
export type Side = (typeof SIDES)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type SignalKind = (typeof SIGNAL_KINDS)[number];
export type Audience = (typeof AUDIENCES)[number];
export type SuggestionIntent = (typeof SUGGESTION_INTENTS)[number];
export type Source = (typeof SOURCES)[number];

/** Global infrastructure state (worker heartbeat, bot identity). Holds no tenant data. */
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
