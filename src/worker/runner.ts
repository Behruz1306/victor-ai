import type { Db } from "@/lib/db/client";
import type { Job } from "@/lib/db/schema";
import { claimJob, completeJob, failJob, type JobType } from "@/lib/jobs/queue";
import { handlers } from "./handlers";

export type JobHandler = (db: Db, payload: Record<string, unknown>, job: Job) => Promise<void>;

export async function runJob(db: Db, job: Job): Promise<boolean> {
  const handler = handlers[job.type as JobType];
  if (!handler) {
    await failJob(db, { ...job, attempts: job.maxAttempts }, `no handler for ${job.type}`);
    return false;
  }
  try {
    await handler(db, job.payload, job);
    await completeJob(db, job.id);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.type} failed (attempt ${job.attempts}): ${message}`);
    await failJob(db, job, message);
    return false;
  }
}

/** Claims and runs one due job. Returns false when the queue has nothing due. */
export async function runOnce(db: Db, types?: readonly JobType[]): Promise<boolean> {
  const job = await claimJob(db, types);
  if (!job) return false;
  await runJob(db, job);
  return true;
}

/**
 * Runs jobs until the queue is empty, ignoring debounce delays (used by `pnpm seed --analyze`,
 * the demo control room and integration tests). Returns the number of jobs processed.
 */
export async function drainJobs(
  db: Db,
  opts: { max?: number; types?: JobType[] } = {},
): Promise<number> {
  const { sql } = await import("drizzle-orm");
  let processed = 0;
  const max = opts.max ?? 500;
  while (processed < max) {
    await db.execute(
      sql`update jobs set run_after = now() where status = 'pending' and run_after > now() and type <> 'replay_message'`,
    );
    const ran = await runOnce(db, opts.types);
    if (!ran) break;
    processed++;
  }
  return processed;
}
