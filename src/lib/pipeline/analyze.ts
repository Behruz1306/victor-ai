import type { Db } from "@/lib/db/client";
import { generateStructured } from "@/lib/llm";
import { CustomerAnalysis } from "@/lib/llm/schemas";
import { ANALYSIS_INSTRUCTIONS, renderAnalysisPrompt } from "@/lib/llm/prompts/analysis";
import { buildAnalysisContext } from "./context";
import { applyAnalysis, type ApplySummary } from "./apply";
import { runSla, scheduleOwnerDigest } from "./sla-apply";

/** analyze_customer job: context → one LLM call → deterministic application → SLA pass. */
export async function analyzeCustomer(
  db: Db,
  companyId: string,
  customerId: string,
  now = new Date(),
): Promise<ApplySummary | null> {
  const ctx = await buildAnalysisContext(db, companyId, customerId, now);
  if (!ctx || !ctx.input.messages.length) return null;
  const out = await generateStructured(
    CustomerAnalysis,
    { instructions: ANALYSIS_INSTRUCTIONS, prompt: renderAnalysisPrompt(ctx.input) },
    {
      model: "main",
      task: "customer_analysis",
      mockInput: ctx.input,
      log: { db, companyId, customerId },
      maxOutputTokens: 12000,
    },
  );
  if (!out) return null;
  const summary = await applyAnalysis(db, ctx, out, now);
  if (summary.rejected.length) {
    console.log(
      `[analyze] ${ctx.customer.name}: rejected ${summary.rejected.length} task updates (${summary.rejected.map((r) => r.reason).join(", ")})`,
    );
  }
  await runSla(db, companyId, now);
  if (summary.signalsOpened) await scheduleOwnerDigest(db, companyId);
  return summary;
}
