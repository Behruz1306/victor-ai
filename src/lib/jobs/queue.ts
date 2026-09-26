import { sql, and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, type Job } from "@/lib/db/schema";

export type JobType =
  | "analyze_customer"
  | "owner_digest"
  | "distill_rule"
  | "telegram_send"
  | "replay_message"
  | "map_proposal"
  | "retention_cleanup";

export type EnqueueOptions = {
  type: JobType;
  payload: Record<string, unknown>;
  companyId?: string | null;
  /** Run no earlier than now + delayMs. */
  delayMs?: number;
  /** Pending jobs with the same key are merged (debounce). */
  dedupeKey?: string;
  /** With dedupeKey: each new enqueue pushes the run back by this much, capped at 4× after first enqueue. */
  debounceMs?: number;
  maxAttempts?: number;
};

/** Pure: exponential backoff for retry n (1-based), capped at 10 min. */
export function backoffMs(attempt: number): number {
  return Math.min(10 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

export async function enqueue(db: Db, opts: EnqueueOptions): Promise<void> {
  const delay = opts.debounceMs ?? opts.delayMs ?? 0;
  const values = {
    type: opts.type,
    payload: opts.payload,
    companyId: opts.companyId ?? null,
    runAfter: sql`now() + (${delay}::int * interval '1 millisecond')`,
    dedupeKey: opts.dedupeKey ?? null,
    maxAttempts: opts.maxAttempts ?? 5,
  };
  if (!opts.dedupeKey) {
    await db.insert(jobs).values(values);
    return;
  }
  const debounce = opts.debounceMs ?? 0;
  await db
    .insert(jobs)
    .values(values)
    .onConflictDoUpdate({
      target: jobs.dedupeKey,
      targetWhere: sql`status = 'pending' and dedupe_key is not null`,
      set: {
        payload: sql`excluded.payload`,
        // Debounce: push back, but never beyond first_enqueued_at + 4× debounce.
        runAfter: sql`least(${jobs.firstEnqueuedAt} + (${debounce * 4}::int * interval '1 millisecond'), greatest(${jobs.runAfter}, now() + (${debounce}::int * interval '1 millisecond')))`,
        updatedAt: sql`now()`,
      },
    });
}

/** Atomically claims one due job (FOR UPDATE SKIP LOCKED) and marks it running. */
export async function claimJob(db: Db, types?: readonly JobType[]): Promise<Job | null> {
  const typeFilter =
    types && types.length
      ? sql`and type in (${sql.join(
          types.map((t) => sql`${t}`),
          sql`, `,
        )})`
      : sql``;
  const rows = await db.execute<Record<string, unknown>>(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs
      where status = 'pending' and run_after <= now() ${typeFilter}
      order by run_after
      limit 1
      for update skip locked
    )
    returning id`);
  const id = rows[0]?.id as string | undefined;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

export async function completeJob(db: Db, id: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", lockedAt: null, lastError: null, updatedAt: sql`now()` })
    .where(eq(jobs.id, id));
}

export async function failJob(db: Db, job: Job, error: string): Promise<void> {
  const retry = job.attempts < job.maxAttempts;
  await db
    .update(jobs)
    .set({
      status: retry ? "pending" : "failed",
      lockedAt: null,
      lastError: error.slice(0, 1000),
      // A retried job keeps its dedupe key only if no newer pending twin exists.
      dedupeKey: retry
        ? sql`case when exists (select 1 from jobs j2 where j2.dedupe_key = jobs.dedupe_key and j2.status = 'pending' and j2.id <> jobs.id) then null else jobs.dedupe_key end`
        : job.dedupeKey,
      runAfter: sql`now() + (${backoffMs(job.attempts)}::int * interval '1 millisecond')`,
      updatedAt: sql`now()`,
    })
    .where(eq(jobs.id, job.id));
}

/** Jobs stuck in running (worker crashed) go back to pending, unless a newer twin is queued. */
export async function recoverStaleJobs(db: Db, staleMinutes = 10): Promise<number> {
  const stale = sql`status = 'running' and locked_at < now() - (${staleMinutes}::int * interval '1 minute')`;
  await db.execute(sql`
    update jobs set status = 'done', last_error = 'superseded after stale lock', updated_at = now()
    where ${stale} and dedupe_key is not null
      and exists (select 1 from jobs j2 where j2.dedupe_key = jobs.dedupe_key and j2.status = 'pending')`);
  const rows = await db.execute(sql`
    update jobs set status = 'pending', locked_at = null, updated_at = now()
    where ${stale} returning id`);
  return rows.length;
}

export async function cancelPending(db: Db, type: JobType, companyId: string): Promise<number> {
  const rows = await db
    .delete(jobs)
    .where(and(eq(jobs.type, type), eq(jobs.companyId, companyId), eq(jobs.status, "pending")))
    .returning({ id: jobs.id });
  return rows.length;
}

export async function queueStats(db: Db, companyId: string) {
  const rows = await db.execute<{ status: string; type: string; n: number }>(sql`
    select status, type, count(*)::int as n from jobs
    where (company_id = ${companyId} or company_id is null)
      and (status <> 'done' or updated_at > now() - interval '1 hour')
    group by status, type`);
  return rows.map((r) => ({ status: r.status, type: r.type, n: Number(r.n) }));
}

export async function hasPending(db: Db, companyId: string, types: JobType[]): Promise<boolean> {
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        inArray(jobs.type, types),
        inArray(jobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Enqueues only if no job with this dedupe key exists in any state (e.g. once per day). */
export async function enqueueOnce(db: Db, opts: EnqueueOptions & { dedupeKey: string }): Promise<boolean> {
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.dedupeKey, opts.dedupeKey))
    .limit(1);
  if (existing) return false;
  await enqueue(db, opts);
  return true;
}
