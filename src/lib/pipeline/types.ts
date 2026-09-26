import type { ChatType, Side, SignalKind, TaskKind, TaskStatus } from "@/lib/db/schema";
import type { L10n, SlaConfig, WatchCriteria } from "@/lib/types";

// Structured inputs for LLM tasks. The prompt builders render them to text for real
// models; the mock provider reads them directly. Ids are short prompt-local ids.

export type CtxChannel = {
  id: string; // c1
  dbId: string;
  title: string;
  chatType: ChatType;
  /** Serves several customers (e.g. one Fleet chat). */
  shared: boolean;
  lang: "en" | "ru";
};

export type CtxMessage = {
  id: string; // m1
  dbId: string;
  channelId: string; // c1
  chatType: ChatType;
  channelTitle: string;
  side: Side;
  senderName: string;
  userName: string | null;
  text: string;
  sentAt: Date;
  untrusted: boolean;
  replyToId: string | null; // m…
};

export type CtxTaskEvent = { toStatus: TaskStatus; at: Date; evidenceId: string | null };

export type CtxTask = {
  id: string; // t1
  dbId: string;
  title: L10n;
  kind: TaskKind;
  status: TaskStatus;
  ref: string | null;
  deadlineAt: Date | null;
  channelId: string | null; // c…
  createdFromId: string | null; // m…
  createdAt: Date;
  events: CtxTaskEvent[];
};

export type CtxRule = {
  id: string; // r1
  dbId: string;
  text: string;
  scope: "company" | "customer" | "chat_type";
  chatType: ChatType | null;
};

export type CtxEdit = {
  proposed: string;
  final: string;
  reason: string | null;
  channelTitle: string;
};

export type AnalysisInput = {
  now: Date;
  company: { name: string; timezone: string; sla: SlaConfig; watchCriteria: WatchCriteria };
  customer: { name: string; kind: string; brief: string; assigneeName: string | null };
  channels: CtxChannel[];
  messages: CtxMessage[];
  tasks: CtxTask[];
  rules: CtxRule[];
  recentEdits: CtxEdit[];
};

export type DigestCandidate = {
  signalId: string;
  kind: SignalKind;
  severity: number;
  customerName: string | null;
  responsibleName: string | null;
  title: L10n;
  reason: L10n;
  evidenceQuote: string | null;
  createdAt: Date;
  criteriaMatch: string | null;
};

export type DigestInput = { now: Date; companyName: string; candidates: DigestCandidate[] };

export type DistillInput = {
  customerName: string | null;
  chatType: ChatType | null;
  proposed: string;
  final: string;
  reason: string | null;
  existingRules: { id: string; text: string; scope: string }[];
};

export type MappingInput = {
  title: string;
  firstMessages: { sender: string; text: string }[];
  customers: { id: string; name: string }[];
};

export type CriteriaInput = {
  answers: string[];
  customers: { id: string; name: string }[];
  lang: "en" | "ru";
};

export type HandoffInput = {
  now: Date;
  timezone: string;
  fromName: string;
  toName: string;
  customer: { name: string; brief: string };
  dailySummaries: { day: string; summary: string }[];
  channels: { id: string; title: string; chatType: ChatType }[];
  tasks: {
    title: string;
    status: TaskStatus;
    kind: TaskKind;
    deadlineAt: Date | null;
    channelId: string | null;
    ref: string | null;
  }[];
  messages: CtxMessage[];
};
