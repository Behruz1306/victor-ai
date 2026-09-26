import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";
import { generateStructured } from "@/lib/llm";
import { WatchCriteriaOut } from "@/lib/llm/schemas";
import { CRITERIA_INSTRUCTIONS, renderCriteriaPrompt } from "@/lib/llm/prompts/other";
import type { WatchCriterion } from "@/lib/types";

/** Owner's three free-text answers → structured, editable watch criteria (5.8). */
export async function proposeCriteria(
  db: Db,
  companyId: string,
  answers: string[],
  lang: "en" | "ru",
): Promise<WatchCriterion[]> {
  const custs = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  const input = { answers, customers: custs, lang };
  const out = await generateStructured(
    WatchCriteriaOut,
    { instructions: CRITERIA_INSTRUCTIONS, prompt: renderCriteriaPrompt(input) },
    { model: "fast", task: "watch_criteria", mockInput: input, log: { db, companyId } },
  );
  const known = new Set(custs.map((c) => c.id));
  return (out?.items ?? []).slice(0, 8).map((i) => ({
    id: randomUUID(),
    text: i.text.slice(0, 200),
    kinds: i.kinds,
    customerIds: i.customer_ids.filter((c) => known.has(c)),
    minSeverity: Math.max(1, Math.min(5, Math.round(i.min_severity))),
  }));
}
