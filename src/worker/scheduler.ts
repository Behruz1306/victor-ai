import type { Db } from "@/lib/db/client";
import { enqueueOnce } from "@/lib/jobs/queue";

/** Runs every 30 s: daily retention job. The SLA engine is added in phase 3. */
export async function schedulerTick(db: Db): Promise<void> {
  await enqueueOnce(db, {
    type: "retention_cleanup",
    payload: {},
    dedupeKey: `retention:${new Date().toISOString().slice(0, 10)}`,
    delayMs: 60_000,
  });
}
