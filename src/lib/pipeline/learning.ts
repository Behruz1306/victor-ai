import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, customers, playbookRules, suggestions } from "@/lib/db/schema";
import { generateStructured } from "@/lib/llm";
import { DistilledRule } from "@/lib/llm/schemas";
import { DISTILL_INSTRUCTIONS, renderDistillPrompt } from "@/lib/llm/prompts/other";

export type LearnedRule = {
  ruleId: string;
  ruleText: string;
  scope: "company" | "customer" | "chat_type";
  status: "active" | "proposed";
  merged: boolean;
  customerName: string | null;
};

/**
 * distill_rule: compare what the system proposed with what the human sent (+ reason) and
 * keep at most one reusable rule. Customer/chat-type rules are active immediately;
 * company-wide rules wait for a lead/owner in the Playbook.
 */
export async function distillFromSuggestion(
  db: Db,
  companyId: string,
  suggestionId: string,
): Promise<LearnedRule | null> {
  const [row] = await db
    .select({ s: suggestions, chatType: channels.chatType, customerName: customers.name })
    .from(suggestions)
    .innerJoin(channels, eq(channels.id, suggestions.channelId))
    .leftJoin(customers, eq(customers.id, suggestions.customerId))
    .where(and(eq(suggestions.id, suggestionId), eq(suggestions.companyId, companyId)));
  if (!row || row.s.status !== "edited" || !row.s.finalText) return null;
  const s = row.s;

  const existing = await db
    .select()
    .from(playbookRules)
    .where(
      and(
        eq(playbookRules.companyId, companyId),
        inArray(playbookRules.status, ["active", "proposed"]),
        or(
          eq(playbookRules.scope, "company"),
          eq(playbookRules.scope, "chat_type"),
          s.customerId
            ? and(eq(playbookRules.scope, "customer"), eq(playbookRules.customerId, s.customerId))
            : sql`false`,
        ),
      ),
    );
  const shortIds = new Map(existing.map((r, i) => [`r${i + 1}`, r]));
  const input = {
    customerName: row.customerName,
    chatType: row.chatType,
    proposed: s.proposedText,
    final: s.finalText!,
    reason: s.editReason,
    existingRules: [...shortIds.entries()].map(([id, r]) => ({
      id,
      text: r.ruleText,
      scope: r.scope,
    })),
  };
  const out = await generateStructured(
    DistilledRule,
    { instructions: DISTILL_INSTRUCTIONS, prompt: renderDistillPrompt(input) },
    {
      model: "fast",
      task: "distill_rule",
      mockInput: input,
      log: { db, companyId, customerId: s.customerId, channelId: s.channelId },
    },
  );
  if (!out?.rule) return null;
  const scope = out.rule.scope === "customer" && !s.customerId ? "chat_type" : out.rule.scope;
  const text = out.rule.rule_text.trim().slice(0, 500);
  if (!text) return null;

  const target = out.merge_with_rule_id ? shortIds.get(out.merge_with_rule_id) : undefined;
  if (target) {
    await db
      .update(playbookRules)
      .set({
        ruleText: text,
        examples: [...new Set([...target.examples, suggestionId])],
        updatedAt: sql`now()`,
      })
      .where(eq(playbookRules.id, target.id));
    return {
      ruleId: target.id,
      ruleText: text,
      scope: target.scope,
      status: target.status === "proposed" ? "proposed" : "active",
      merged: true,
      customerName: row.customerName,
    };
  }
  const status = scope === "company" ? "proposed" : "active";
  const [created] = await db
    .insert(playbookRules)
    .values({
      companyId,
      scope,
      customerId: scope === "customer" ? s.customerId : null,
      chatType: scope === "chat_type" ? row.chatType : null,
      ruleText: text,
      examples: [suggestionId],
      status,
      createdFrom: "edit",
    })
    .returning({ id: playbookRules.id });
  return {
    ruleId: created!.id,
    ruleText: text,
    scope,
    status,
    merged: false,
    customerName: row.customerName,
  };
}
