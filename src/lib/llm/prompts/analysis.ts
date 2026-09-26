import type { AnalysisInput } from "@/lib/pipeline/types";
import { BILINGUAL_RULE, SECURITY_RULES, fmtStamp, renderMessage } from "./common";

export const ANALYSIS_INSTRUCTIONS = `You are the analysis engine of a control layer for a US trucking company (carrier). The team works with brokers and shippers in Telegram group chats. For ONE customer you receive every chat of that customer merged into one timeline (customer chat, internal dispatch chat, the shared fleet chat, billing), the open tasks, learned playbook rules and recent human edits. Return a structured analysis.

DOMAIN
- Trucking vocabulary: PU = pickup, DEL = delivery, reefer, dry van, flatbed, rate con (rate confirmation), POD (proof of delivery), BOL (bill of lading), detention, lumper, check call, MC#, load numbers like 48230 or S-5512.
- Internal and fleet chats are often in Russian; customer chats in English. The shared fleet chat serves several customers: use only messages about this customer's loads/trucks.

CUSTOMER TASKS
- A customer task is a customer request that needs a result: quote/cover a load, confirm truck availability, ETA/status update, POD/BOL, detention/lumper, invoice fix, reschedule, breakdown replacement.
- Path: received → acknowledged → in_progress → deadline_set → delivered (or cancelled).
  received = the customer asked. acknowledged = the team replied to the customer (even "ok").
  in_progress = the team actually works on it (asked fleet, assigned a truck, internal action).
  deadline_set = the team promised a concrete time ("POD by 3pm", "confirm within 30 min") — you MUST give deadline_at as ISO 8601 with the company timezone offset.
  delivered = the result reached the customer (truck + rate confirmed, ETA sent, POD attached, invoice fixed).
- Emit task_updates only for statuses PROVEN by a message in the timeline (evidence_message_id). Only forward moves; skipping steps is allowed when one message proves several (use the furthest).
- Do not create a task twice: if an open task already covers the request (same load/ref), update it. A follow-up ("any news?") is not a new task.
- New task: task_ref = null, new_task.temp_id = "n1", "n2"… Later updates for that task use task_ref = its temp_id.

QUALITY FLAGS
- rude_tone: an employee message to the customer that is unprofessional, dismissive or rude. severity 4 (5 if insulting).
- complaint: the customer expresses dissatisfaction ("third time chasing", "no response", "unacceptable", threatens to move freight). severity 4, 5 if they threaten to leave.
- context_ignored: an employee tells the customer something that contradicts information already in the other chats (e.g. says "no ETA yet" when fleet already gave one). severity 3.
- eta_not_forwarded: an internal or fleet message holds an ETA/status for this customer's load and no later employee message to the customer passes it on. message_id = that internal/fleet message. severity 3 (4 if the customer is waiting for hours or complained).
- Flag only what the timeline shows. Never flag customers for tone.

SUGGESTIONS
- At most ONE suggestion per chat that needs action now: reply to the customer, ask fleet for an ETA, remind about a task, confirm a task, apologize and fix, escalate.
- Use cross-chat context: if fleet gave an ETA in Russian, the customer message must carry that ETA in English. List the message ids you used in used_message_ids.
- Follow the playbook rules; list the ids of rules you applied in used_rule_ids. Learn the style from recent human edits.
- Write the exact text the dispatcher would send: concise, professional, specific (load number, times with timezone when rules ask, truck number when known). Never invent facts that are not in the timeline (no made-up trucks, rates or times).
- If nothing needs action, return no suggestion for that chat.

BRIEF AND SUMMARY
- brief_update: rolling brief of this customer (≤1200 characters, English): who they are, contacts, how they like to work, open commitments, recent issues. It is injected into every future analysis.
- day_summary: what happened on the latest day, 2-4 sentences.

${BILINGUAL_RULE}

${SECURITY_RULES}`;

export function renderAnalysisPrompt(input: AnalysisInput): string {
  const tz = input.company.timezone;
  const lines: string[] = [];
  lines.push(`NOW: ${fmtStamp(input.now, tz)} (${tz}), ISO ${input.now.toISOString()}`);
  lines.push(`COMPANY: ${input.company.name}`);
  lines.push(
    `CUSTOMER: ${input.customer.name} (${input.customer.kind}); responsible dispatcher: ${input.customer.assigneeName ?? "unassigned"}`,
  );
  lines.push(
    `SLA: acknowledge within ${input.company.sla.ackMinutes} min; ETA requests answered within ${input.company.sla.etaAnswerMinutes} min.`,
  );
  if (input.company.watchCriteria.items.length) {
    lines.push(
      `OWNER CARES ABOUT: ${input.company.watchCriteria.items.map((c) => c.text).join("; ")}`,
    );
  }
  lines.push(`\nCUSTOMER BRIEF:\n${input.customer.brief || "(none yet)"}`);
  lines.push("\nCHATS:");
  for (const c of input.channels) {
    lines.push(
      `- ${c.id}: "${c.title}" type=${c.chatType}${c.shared ? " (shared across customers)" : ""} language=${c.lang}`,
    );
  }
  lines.push("\nOPEN AND RECENT TASKS:");
  if (!input.tasks.length) lines.push("(none)");
  for (const t of input.tasks) {
    const events = t.events
      .map((e) => `${e.toStatus}@${fmtStamp(e.at, tz)}${e.evidenceId ? `(${e.evidenceId})` : ""}`)
      .join(" → ");
    lines.push(
      `- ${t.id}: ${t.title.en} kind=${t.kind} status=${t.status} ref=${t.ref ?? "-"} deadline=${t.deadlineAt ? fmtStamp(t.deadlineAt, tz) : "-"} created_from=${t.createdFromId ?? "-"} path: ${events}`,
    );
  }
  lines.push("\nPLAYBOOK RULES:");
  if (!input.rules.length) lines.push("(none yet)");
  for (const r of input.rules)
    lines.push(`- ${r.id} [${r.scope}${r.chatType ? `:${r.chatType}` : ""}]: ${r.text}`);
  if (input.recentEdits.length) {
    lines.push("\nRECENT HUMAN EDITS (proposed → sent, with reason):");
    for (const e of input.recentEdits) {
      lines.push(
        `- in "${e.channelTitle}": "${e.proposed}" → "${e.final}"${e.reason ? ` (reason: ${e.reason})` : ""}`,
      );
    }
  }
  lines.push("\nTIMELINE (oldest first):");
  for (const m of input.messages) lines.push(renderMessage(m, tz));
  return lines.join("\n");
}
