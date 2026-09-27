import type {
  CriteriaInput,
  DigestInput,
  DistillInput,
  HandoffInput,
  MappingInput,
} from "@/lib/pipeline/types";
import { BILINGUAL_RULE, SECURITY_RULES, fmtStamp, renderMessage } from "./common";

export const DIGEST_INSTRUCTIONS = `You write the owner's digest for a trucking company. The owner does not read chats. You receive at most 5 signals that code already selected and ranked. For EACH signal write: a short title (≤10 words), what happened (1-2 sentences in your own words, concrete: customer, load, times — do NOT paste the evidence quote, the screen shows it right below), and why it matters to the business (1 sentence: lost load, broker relationship, cash, SLA). Plain language, no jargon beyond trucking terms the owner knows. Do not add, drop or reorder items; use the given signal_id.

${BILINGUAL_RULE}

${SECURITY_RULES}`;

export function renderDigestPrompt(input: DigestInput): string {
  const lines = [`COMPANY: ${input.companyName}`, `NOW: ${input.now.toISOString()}`, "SIGNALS:"];
  for (const c of input.candidates) {
    lines.push(
      `- signal_id=${c.signalId} kind=${c.kind} severity=${c.severity} customer=${c.customerName ?? "-"} responsible=${c.responsibleName ?? "-"}\n  title: ${c.title.en}\n  reason: ${c.reason.en}\n  evidence: <untrusted>${(c.evidenceQuote ?? "").replace(/<\/?untrusted>/gi, "")}</untrusted>${c.criteriaMatch ? `\n  matches owner criterion: ${c.criteriaMatch}` : ""}`,
    );
  }
  return lines.join("\n");
}

export const DISTILL_INSTRUCTIONS = `A dispatcher edited a message the system suggested. Compare the proposed text with what was actually sent (and the optional reason) and decide whether there is ONE reusable rule for future suggestions.
- Output rule = null if the edit is a one-off fact correction (different time, typo) with no general lesson.
- rule_text: one imperative sentence a future writer can follow ("Give Apex ETAs in CST and include the truck number.").
- scope: "customer" when the lesson is about this customer (default), "chat_type" when it is about a kind of chat (e.g. all fleet chats), "company" only when the reason clearly says it applies to everyone.
- If an existing rule already says the same thing, set merge_with_rule_id to its id and give the merged rule_text.

${SECURITY_RULES}`;

export function renderDistillPrompt(input: DistillInput): string {
  return [
    `CUSTOMER: ${input.customerName ?? "-"}; CHAT TYPE: ${input.chatType ?? "-"}`,
    `PROPOSED: <untrusted>${input.proposed}</untrusted>`,
    `SENT: <untrusted>${input.final}</untrusted>`,
    `REASON: ${input.reason ? `<untrusted>${input.reason}</untrusted>` : "(none)"}`,
    "EXISTING RULES:",
    ...(input.existingRules.length
      ? input.existingRules.map((r) => `- ${r.id} [${r.scope}]: ${r.text}`)
      : ["(none)"]),
  ].join("\n");
}

export const MAPPING_INSTRUCTIONS = `A Telegram group was connected to a trucking company's control system. From its title and first messages, propose which customer it belongs to (choose an existing customer id, or suggest a new customer name, or null for a shared internal chat) and its chat type: customer (with the broker/shipper), internal (dispatch team about a customer), fleet (drivers/fleet managers), billing, support. confidence 0-1 and a one-line reason.

${SECURITY_RULES}`;

export function renderMappingPrompt(input: MappingInput): string {
  return [
    `GROUP TITLE: ${input.title}`,
    "EXISTING CUSTOMERS:",
    ...input.customers.map((c) => `- ${c.id}: ${c.name}`),
    "FIRST MESSAGES:",
    ...input.firstMessages.map((m) => `- ${m.sender}: <untrusted>${m.text}</untrusted>`),
  ].join("\n");
}

export const CRITERIA_INSTRUCTIONS = `The owner of a trucking company answered three questions about why he reads the team's chats. He cannot formulate exact rules; your job is to turn his words into 3-6 concrete watch criteria. Each criterion: plain-language text in the owner's language, the signal kinds it maps to (reply_needed, no_ack, missing_deadline, overdue, eta_not_forwarded, rude_tone, complaint, context_ignored, customer_silent), customer ids if he named specific customers (else empty), and the minimum severity 1-5 that should reach him.

${SECURITY_RULES}`;

export function renderCriteriaPrompt(input: CriteriaInput): string {
  return [
    `OWNER LANGUAGE: ${input.lang}`,
    "CUSTOMERS:",
    ...input.customers.map((c) => `- ${c.id}: ${c.name}`),
    "ANSWERS:",
    ...input.answers.map((a, i) => `${i + 1}. <untrusted>${a}</untrusted>`),
  ].join("\n");
}

export const HANDOFF_INSTRUCTIONS = `A dispatcher is leaving and a replacement takes over his customers. For EACH chat of this customer write a handoff brief: what happened recently, what was promised to whom and by when, current risks, and the concrete next steps for the replacement (first things first). Be specific: load numbers, times, names. Never invent facts.

${BILINGUAL_RULE}

${SECURITY_RULES}`;

export function renderHandoffPrompt(input: HandoffInput): string {
  const tz = input.timezone;
  return [
    `NOW: ${fmtStamp(input.now, tz)}; FROM: ${input.fromName}; TO: ${input.toName}`,
    `CUSTOMER: ${input.customer.name}`,
    `BRIEF: ${input.customer.brief || "(none)"}`,
    "DAILY SUMMARIES:",
    ...(input.dailySummaries.length
      ? input.dailySummaries.map((d) => `- ${d.day}: ${d.summary}`)
      : ["(none)"]),
    "CHATS:",
    ...input.channels.map((c) => `- ${c.id}: "${c.title}" (${c.chatType})`),
    "OPEN TASKS:",
    ...(input.tasks.length
      ? input.tasks.map(
          (t) =>
            `- ${t.title} [${t.kind}] status=${t.status} deadline=${t.deadlineAt ? fmtStamp(t.deadlineAt, tz) : "-"} chat=${t.channelId ?? "-"}`,
        )
      : ["(none)"]),
    "LAST MESSAGES:",
    ...input.messages.map((m) => renderMessage(m, tz)),
  ].join("\n");
}
