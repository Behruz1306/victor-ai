// Deterministic application of a CustomerAnalysis: the model proposes, code decides.
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  customers,
  dailySummaries,
  playbookRules,
  suggestions,
  taskEvents,
  tasks,
  type SignalKind,
} from "@/lib/db/schema";
import type { CustomerAnalysis } from "@/lib/llm/schemas";
import { redactOutbound } from "@/lib/security/redact";
import { localDay } from "@/lib/time";
import type { L10n } from "@/lib/types";
import type { AnalysisContext } from "./context";
import { planTransition } from "./state-machine";
import { routeAudience } from "./audience";
import { upsertSignal } from "./signals-store";
import { isEtaInfo } from "@/lib/heuristics/extract";

export const BRIEF_MAX = 1200;
const CUSTOMER_FACING = new Set(["customer", "billing", "support"]);

/** Clamp like Iva's core-clamp: whole sentences, hard cap. */
export function clampBrief(text: string, max = BRIEF_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut.slice(0, max - 1) + "…";
}

const IMPLIED: L10n = { en: "Implied by the same message.", ru: "Следует из того же сообщения." };

export function signalTitle(kind: SignalKind, customerName: string): L10n {
  const t: Partial<Record<SignalKind, L10n>> = {
    rude_tone: { en: `Rude reply to ${customerName}`, ru: `Грубый ответ клиенту ${customerName}` },
    complaint: { en: `${customerName} complained`, ru: `${customerName} жалуется` },
    context_ignored: {
      en: `Reply to ${customerName} ignored known context`,
      ru: `Ответ ${customerName} без учёта контекста`,
    },
    eta_not_forwarded: {
      en: `ETA not forwarded to ${customerName}`,
      ru: `ETA не передан клиенту ${customerName}`,
    },
  };
  return t[kind] ?? { en: kind, ru: kind };
}

export type ApplySummary = {
  tasksCreated: number;
  transitions: number;
  rejected: { ref: string | null; reason: string }[];
  signalsOpened: number;
  suggestionsCreated: number;
};

export async function applyAnalysis(
  db: Db,
  ctx: AnalysisContext,
  out: CustomerAnalysis,
  now: Date,
): Promise<ApplySummary> {
  const { company, customer, maps } = ctx;
  const companyId = company.id;
  const summary: ApplySummary = {
    tasksCreated: 0,
    transitions: 0,
    rejected: [],
    signalsOpened: 0,
    suggestionsCreated: 0,
  };
  const temp = new Map<string, string>();
  const mainCustomerChannel = ctx.channels.find(
    (c) => c.customerId === customer.id && c.chatType === "customer",
  );

  const resolveTask = (ref: string | null): string | null => {
    if (!ref) return null;
    return maps.task.get(ref) ?? temp.get(ref) ?? null;
  };

  // 1. Tasks through the state machine.
  for (const u of out.task_updates) {
    const ev = maps.message.get(u.evidence_message_id);
    let taskId = resolveTask(u.task_ref);
    let current: (typeof tasks.$inferSelect)["status"] | null = null;

    if (!taskId && u.new_task) {
      if (!ev) {
        summary.rejected.push({ ref: u.new_task.temp_id, reason: "evidence_missing" });
        continue;
      }
      // Never create the same task twice: same source message, or same open kind+ref.
      const [dup] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.companyId, companyId),
            eq(tasks.customerId, customer.id),
            u.new_task.ref
              ? sql`(${tasks.createdFromMessageId} = ${ev.dbId} or (${tasks.kind} = ${u.new_task.kind} and ${tasks.ref} = ${u.new_task.ref} and ${tasks.status} not in ('delivered','cancelled')))`
              : eq(tasks.createdFromMessageId, ev.dbId),
          ),
        )
        .limit(1);
      if (dup) {
        taskId = dup.id;
      } else {
        const plan = planTransition({
          current: null,
          proposed: u.proposed_status,
          evidenceExists: true,
          deadline: u.deadline_at,
        });
        if (!plan.ok) {
          summary.rejected.push({ ref: u.new_task.temp_id, reason: plan.reason });
          continue;
        }
        const channelId = CUSTOMER_FACING.has(ev.chatType)
          ? ev.channelDbId
          : (mainCustomerChannel?.id ?? null);
        const last = plan.steps.at(-1)!;
        const [row] = await db
          .insert(tasks)
          .values({
            companyId,
            customerId: customer.id,
            channelId,
            title: u.new_task.title,
            kind: u.new_task.kind,
            ref: u.new_task.ref,
            status: last,
            deadlineAt: plan.deadlineAt,
            assigneeUserId: customer.assignedUserId,
            createdFromMessageId: ev.dbId,
            lastEventAt: ev.sentAt,
            closedAt: plan.closed ? ev.sentAt : null,
            createdAt: ev.sentAt,
          })
          .returning({ id: tasks.id });
        taskId = row!.id;
        temp.set(u.new_task.temp_id, taskId);
        await db.insert(taskEvents).values(
          plan.steps.map((s, i) => ({
            companyId,
            taskId: taskId!,
            fromStatus: i === 0 ? null : plan.steps[i - 1]!,
            toStatus: s,
            evidenceMessageId: ev.dbId,
            explanation: i === plan.steps.length - 1 ? u.explanation : IMPLIED,
            actor: "ai" as const,
            // +i ms keeps implied steps in path order when they share one evidence message.
            at: new Date(ev.sentAt.getTime() + i),
          })),
        );
        summary.tasksCreated++;
        summary.transitions += plan.steps.length;
        continue;
      }
      temp.set(u.new_task.temp_id, taskId);
    }
    if (!taskId) {
      summary.rejected.push({ ref: u.task_ref, reason: "unknown_task" });
      continue;
    }
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.companyId, companyId)));
    if (!task) continue;
    current = task.status;
    const plan = planTransition({
      current,
      proposed: u.proposed_status,
      evidenceExists: Boolean(ev),
      deadline: u.deadline_at,
    });
    if (!plan.ok) {
      if (plan.reason !== "not_forward")
        summary.rejected.push({ ref: u.task_ref, reason: plan.reason });
      continue;
    }
    // Evidence cannot predate the request.
    const at = ev!.sentAt < task.createdAt ? task.createdAt : ev!.sentAt;
    await db.insert(taskEvents).values(
      plan.steps.map((s, i) => ({
        companyId,
        taskId: task.id,
        fromStatus: i === 0 ? current : plan.steps[i - 1]!,
        toStatus: s,
        evidenceMessageId: ev!.dbId,
        explanation: i === plan.steps.length - 1 ? u.explanation : IMPLIED,
        actor: "ai" as const,
        at: new Date(at.getTime() + i),
      })),
    );
    await db
      .update(tasks)
      .set({
        status: plan.steps.at(-1)!,
        deadlineAt: plan.deadlineAt ?? task.deadlineAt,
        lastEventAt: at,
        closedAt: plan.closed ? at : null,
        stuckReason: plan.closed ? null : task.stuckReason,
        risk: plan.closed ? 0 : task.risk,
      })
      .where(eq(tasks.id, task.id));
    summary.transitions += plan.steps.length;
  }

  // 2. Quality flags → signals.
  for (const f of out.quality_flags) {
    const msg = maps.message.get(f.message_id);
    if (!msg) continue;
    const taskId = resolveTask(f.task_ref);
    if (f.kind === "eta_not_forwarded") {
      // LLM detects, timestamps confirm: ETA must sit in an internal/fleet chat and no later
      // employee message to the customer may carry a time.
      if (CUSTOMER_FACING.has(msg.chatType)) continue;
      const forwarded = [...maps.message.values()].some(
        (m) =>
          CUSTOMER_FACING.has(m.chatType) &&
          (m.side === "employee" || m.side === "bot") &&
          m.sentAt > msg.sentAt &&
          isEtaInfo(m.text, m.sentAt, company.timezone),
      );
      if (forwarded) continue;
      if (taskId) {
        const [t] = await db
          .select({ status: tasks.status })
          .from(tasks)
          .where(eq(tasks.id, taskId));
        if (t && (t.status === "delivered" || t.status === "cancelled")) continue;
      }
    }
    const severity = Math.max(1, Math.min(5, Math.round(f.severity)));
    const taskChannel = taskId
      ? (await db.select({ channelId: tasks.channelId }).from(tasks).where(eq(tasks.id, taskId)))[0]
          ?.channelId
      : null;
    const opened = await upsertSignal(db, companyId, {
      dedupeKey:
        f.kind === "eta_not_forwarded"
          ? `eta_not_forwarded:${taskId ?? msg.dbId}`
          : `${f.kind}:${msg.dbId}`,
      kind: f.kind,
      severity,
      audience: routeAudience(severity, f.kind, customer.id, company.watchCriteria),
      customerId: customer.id,
      channelId:
        f.kind === "eta_not_forwarded" ? (taskChannel ?? msg.channelDbId) : msg.channelDbId,
      taskId,
      responsibleUserId:
        f.kind === "rude_tone" || f.kind === "context_ignored"
          ? (msg.userId ?? customer.assignedUserId)
          : customer.assignedUserId,
      title: signalTitle(f.kind, customer.name),
      reason: f.reason,
      evidenceQuote: msg.text.slice(0, 300),
      evidenceMessageId: msg.dbId,
      source: "ai",
    });
    if (opened) summary.signalsOpened++;
  }

  // 3. Suggestions: one pending per (chat, customer); a new one supersedes the old.
  for (const s of out.suggestions) {
    const ch = maps.channel.get(s.channel_id);
    if (!ch) continue;
    const text = redactOutbound(s.text.trim()).text;
    if (!text) continue;
    const [pending] = await db
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.companyId, companyId),
          eq(suggestions.channelId, ch.dbId),
          eq(suggestions.customerId, customer.id),
          eq(suggestions.status, "pending"),
        ),
      )
      .limit(1);
    if (pending && pending.proposedText === text) continue;
    if (pending) {
      await db
        .update(suggestions)
        .set({ status: "superseded" })
        .where(eq(suggestions.id, pending.id));
    }
    const ruleIds = s.used_rule_ids.map((r) => maps.rule.get(r)).filter(Boolean) as string[];
    await db.insert(suggestions).values({
      companyId,
      channelId: ch.dbId,
      customerId: customer.id,
      taskId: resolveTask(s.task_ref),
      intent: s.intent,
      proposedText: text,
      rationale: s.rationale,
      usedContext: {
        messageIds: s.used_message_ids
          .map((m) => maps.message.get(m)?.dbId)
          .filter(Boolean) as string[],
        ruleIds,
      },
      status: "pending",
    });
    if (ruleIds.length) {
      await db
        .update(playbookRules)
        .set({ hits: sql`${playbookRules.hits} + 1` })
        .where(and(eq(playbookRules.companyId, companyId), inArray(playbookRules.id, ruleIds)));
    }
    summary.suggestionsCreated++;
  }
  // Pending suggestions whose task is already closed are stale.
  await db.execute(sql`
    update suggestions s set status = 'superseded'
    from tasks t
    where s.task_id = t.id and s.company_id = ${companyId} and s.customer_id = ${customer.id}
      and s.status = 'pending' and t.status in ('delivered', 'cancelled')`);

  // 4. Brief (≤1200 chars) and the day's summary.
  if (out.brief_update.trim()) {
    await db
      .update(customers)
      .set({ brief: clampBrief(out.brief_update), briefUpdatedAt: now })
      .where(eq(customers.id, customer.id));
  }
  const latest = [...maps.message.values()].reduce<Date | null>(
    (a, m) => (!a || m.sentAt > a ? m.sentAt : a),
    null,
  );
  if (latest && (out.day_summary.en || out.day_summary.ru)) {
    const day = localDay(latest, company.timezone);
    await db
      .insert(dailySummaries)
      .values({ companyId, customerId: customer.id, day, summary: out.day_summary })
      .onConflictDoUpdate({
        target: [dailySummaries.customerId, dailySummaries.day],
        set: { summary: out.day_summary, updatedAt: sql`now()` },
      });
  }
  return summary;
}

/** Open tasks of a customer (helper for tests and SLA). */
export async function openTaskIds(
  db: Db,
  companyId: string,
  customerId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, companyId),
        eq(tasks.customerId, customerId),
        notInArray(tasks.status, ["delivered", "cancelled"]),
      ),
    );
  return rows.map((r) => r.id);
}
