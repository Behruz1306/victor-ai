import type { Db } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { enqueueOnce } from "@/lib/jobs/queue";
import { runSla } from "@/lib/pipeline/sla-apply";

/** Every 30 s: SLA engine for every company; once a day: retention cleanup. */
export async function schedulerTick(db: Db, now = new Date()): Promise<void> {
  const all = await db.select({ id: companies.id }).from(companies);
  for (const c of all) {
    try {
      await runSla(db, c.id, now);
    } catch (err) {
      console.error(`[sla] company ${c.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await enqueueOnce(db, {
    type: "retention_cleanup",
    payload: {},
    dedupeKey: `retention:${now.toISOString().slice(0, 10)}`,
    delayMs: 60_000,
  });
}
