import { z } from "zod";
import {
  CHAT_TYPES,
  RULE_SCOPES,
  SIGNAL_KINDS,
  SUGGESTION_INTENTS,
  TASK_KINDS,
  TASK_STATUSES,
} from "@/lib/db/schema";

// LLM-facing schemas. Kept to plain JSON-schema features (no min/max/regex) so every
// structured-output provider accepts them; ranges are clamped in code afterwards.
// Ids in these schemas are short prompt-local ids (m12, t3, c2, r1), mapped back in code.

const L10n = z.object({
  en: z.string().describe("English"),
  ru: z.string().describe("Russian"),
});

export const TaskUpdate = z.object({
  task_ref: z
    .string()
    .nullable()
    .describe(
      'Existing task id ("t2") or the temp_id of a new task created earlier in this list ("n1"). Null only together with new_task.',
    ),
  new_task: z
    .object({
      temp_id: z.string().describe('New id like "n1"'),
      title: L10n.describe("Short task title, e.g. 'Reefer Chicago → Dallas, load 48230'"),
      kind: z.enum(TASK_KINDS),
      ref: z.string().nullable().describe("Load / PO / invoice number if any, e.g. '48230'"),
    })
    .nullable(),
  proposed_status: z.enum(TASK_STATUSES),
  evidence_message_id: z.string().describe("Message id (m…) that proves this status"),
  deadline_at: z
    .string()
    .nullable()
    .describe("ISO 8601 with offset. Required for deadline_set: the time the team promised."),
  explanation: L10n,
});

export const QualityFlag = z.object({
  kind: z.enum(["rude_tone", "complaint", "context_ignored", "eta_not_forwarded"]),
  message_id: z
    .string()
    .describe("For eta_not_forwarded: the internal/fleet message holding the ETA"),
  task_ref: z.string().nullable(),
  severity: z.number().describe("1-5"),
  reason: L10n,
});

export const SuggestionOut = z.object({
  channel_id: z.string().describe("Chat to post in (c…)"),
  task_ref: z.string().nullable(),
  intent: z.enum(SUGGESTION_INTENTS),
  text: z.string().describe("Exact message to send, in the language of that chat"),
  rationale: L10n,
  used_message_ids: z.array(z.string()),
  used_rule_ids: z.array(z.string()),
});

export const CustomerAnalysis = z.object({
  task_updates: z.array(TaskUpdate),
  quality_flags: z.array(QualityFlag),
  suggestions: z.array(SuggestionOut),
  brief_update: z.string().describe("Rolling customer brief, max 1200 characters, English"),
  day_summary: L10n.describe("What happened with this customer on the latest day, 2-4 sentences"),
});
export type CustomerAnalysis = z.infer<typeof CustomerAnalysis>;

export const OwnerDigest = z.object({
  items: z.array(
    z.object({
      signal_id: z.string(),
      title: L10n,
      what_happened: L10n,
      why_it_matters: L10n,
    }),
  ),
});
export type OwnerDigest = z.infer<typeof OwnerDigest>;

export const DistilledRule = z.object({
  rule: z
    .object({
      scope: z.enum(RULE_SCOPES),
      rule_text: z
        .string()
        .describe("One imperative sentence, e.g. 'Give Apex ETAs in CST with the truck number.'"),
    })
    .nullable(),
  merge_with_rule_id: z.string().nullable(),
});
export type DistilledRule = z.infer<typeof DistilledRule>;

export const ChannelMapping = z.object({
  customer_id: z.string().nullable(),
  new_customer_name: z.string().nullable(),
  chat_type: z.enum(CHAT_TYPES),
  confidence: z.number().describe("0-1"),
  reason: z.string(),
});
export type ChannelMapping = z.infer<typeof ChannelMapping>;

export const WatchCriteriaOut = z.object({
  items: z.array(
    z.object({
      text: z.string().describe("Plain-language criterion in the owner's language"),
      kinds: z.array(z.enum(SIGNAL_KINDS)),
      customer_ids: z.array(z.string()),
      min_severity: z.number().describe("1-5"),
    }),
  ),
});
export type WatchCriteriaOut = z.infer<typeof WatchCriteriaOut>;

export const HandoffOut = z.object({
  channels: z.array(
    z.object({
      channel_id: z.string(),
      what_happened: L10n,
      promises_made: L10n,
      risks: L10n,
      next_steps: L10n,
    }),
  ),
});
export type HandoffOut = z.infer<typeof HandoffOut>;
