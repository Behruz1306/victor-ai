import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { suggestions, type Suggestion } from "@/lib/db/schema";
import type { Ctx } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/guard";
import { canSeeCustomer } from "@/lib/queries/scope";
import { enqueue } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";
import { deliverSuggestion, type DeliveryMode } from "./delivery";
import { distillFromSuggestion, type LearnedRule } from "./learning";

async function loadPending(db: Db, ctx: Ctx, id: string): Promise<Suggestion> {
  const [s] = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.id, id), eq(suggestions.companyId, ctx.companyId)));
  if (!s || (s.customerId && !(await canSeeCustomer(db, ctx, s.customerId)))) throw new HttpError(404, "suggestion not found");
  if (s.status !== "pending") throw new HttpError(409, "suggestion already decided");
  return s;
}

export async function approveSuggestion(db: Db, ctx: Ctx, id: string): Promise<{ mode: DeliveryMode; text: string }> {
  const s = await loadPending(db, ctx, id);
  await db
    .update(suggestions)
    .set({ status: "approved", finalText: s.proposedText, decidedBy: ctx.userId, decidedAt: sql`now()` })
    .where(eq(suggestions.id, s.id));
  const res = await deliverSuggestion(db, s, s.proposedText, { id: ctx.userId, name: ctx.name });
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "suggestion_approved", target: s.id, meta: { mode: res.mode } });
  return res;
}

export async function editSuggestion(
  db: Db,
  ctx: Ctx,
  id: string,
  text: string,
  reason: string | null,
): Promise<{ mode: DeliveryMode; text: string; rule: LearnedRule | null }> {
  const s = await loadPending(db, ctx, id);
  if (text.trim() === s.proposedText.trim()) {
    const res = await approveSuggestion(db, ctx, id);
    return { ...res, rule: null };
  }
  await db
    .update(suggestions)
    .set({ status: "edited", finalText: text, editReason: reason, decidedBy: ctx.userId, decidedAt: sql`now()` })
    .where(eq(suggestions.id, s.id));
  // Learn first, so the re-analysis triggered by the send already sees the new rule.
  let rule: LearnedRule | null = null;
  try {
    rule = await distillFromSuggestion(db, ctx.companyId, s.id);
  } catch (err) {
    console.error("[learning] inline distill failed, queued for retry:", err instanceof Error ? err.message : err);
    await enqueue(db, { type: "distill_rule", companyId: ctx.companyId, payload: { companyId: ctx.companyId, suggestionId: s.id } });
  }
  const res = await deliverSuggestion(db, s, text, { id: ctx.userId, name: ctx.name });
  if (s.customerId) {
    await enqueue(db, {
      type: "analyze_customer",
      companyId: ctx.companyId,
      payload: { companyId: ctx.companyId, customerId: s.customerId },
      dedupeKey: `analyze:${s.customerId}`,
      debounceMs: 2000,
    });
  }
  await audit({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "suggestion_edited",
    target: s.id,
    meta: { mode: res.mode, reason, ruleId: rule?.ruleId ?? null, ruleText: rule?.ruleText ?? null },
  });
  return { ...res, rule };
}

export async function dismissSuggestion(db: Db, ctx: Ctx, id: string): Promise<void> {
  const s = await loadPending(db, ctx, id);
  await db
    .update(suggestions)
    .set({ status: "dismissed", decidedBy: ctx.userId, decidedAt: sql`now()` })
    .where(eq(suggestions.id, s.id));
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "suggestion_dismissed", target: s.id });
}
