import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  analysisRuns,
  channels,
  companies,
  customers,
  dailySummaries,
  digests,
  handoffs,
  jobs,
  messages,
  playbookRules,
  signals,
  suggestions,
  tasks,
  users,
} from "@/lib/db/schema";
import { cancelPending, enqueue, queueStats } from "@/lib/jobs/queue";
import { DEFAULT_SLA, DEFAULT_CONSENT_TEXT } from "@/lib/types";
import { demoData, findDemoCompanyId, loadYesterday, replayMessages } from "./seed";

/**
 * Wipes everything the pipeline produced (and all messages) for the demo company, but keeps
 * users, customers and chats so the presenter's session survives. Assignments and settings
 * go back to the seed defaults.
 */
export async function resetDemoData(db: Db, companyId: string): Promise<void> {
  await db.delete(jobs).where(eq(jobs.companyId, companyId));
  await db.delete(signals).where(eq(signals.companyId, companyId));
  await db.delete(suggestions).where(eq(suggestions.companyId, companyId));
  await db.delete(tasks).where(eq(tasks.companyId, companyId));
  await db.delete(playbookRules).where(eq(playbookRules.companyId, companyId));
  await db.delete(digests).where(eq(digests.companyId, companyId));
  await db.delete(handoffs).where(eq(handoffs.companyId, companyId));
  await db.delete(dailySummaries).where(eq(dailySummaries.companyId, companyId));
  await db.delete(analysisRuns).where(eq(analysisRuns.companyId, companyId));
  await db.delete(messages).where(eq(messages.companyId, companyId));
  await db
    .update(channels)
    .set({ lastMessageAt: null, consentPostedAt: null })
    .where(eq(channels.companyId, companyId));

  const staff = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.companyId, companyId));
  for (const c of demoData.customers) {
    const seedUser = demoData.users.find((u) => u.key === c.assigned);
    // Email is the identity; the name keeps a company seeded under older demo emails working.
    const userId =
      (
        staff.find((u) => u.email === seedUser?.email) ??
        staff.find((u) => u.name === seedUser?.name)
      )?.id ?? null;
    await db
      .update(customers)
      .set({ assignedUserId: userId, brief: "", briefUpdatedAt: null })
      .where(and(eq(customers.companyId, companyId), eq(customers.name, c.name)));
  }
  await db
    .update(companies)
    .set({
      sla: DEFAULT_SLA,
      watchCriteria: { items: [] },
      settings: {
        sendMode: "copy",
        retentionDays: 90,
        consentText: DEFAULT_CONSENT_TEXT,
        onboardingDone: false,
        signWithName: true,
      },
    })
    .where(eq(companies.id, companyId));
}

/** Schedules the scripted live messages, one every 3–5 s. */
export async function startReplay(db: Db, companyId: string): Promise<number> {
  await cancelPending(db, "replay_message", companyId);
  let delay = 1500;
  for (let i = 0; i < replayMessages.length; i++) {
    await enqueue(db, {
      type: "replay_message",
      companyId,
      payload: { companyId, index: i },
      delayMs: delay,
      maxAttempts: 1,
    });
    delay += 3000 + Math.round(Math.random() * 2000);
  }
  return replayMessages.length;
}

export async function demoStatus(db: Db, companyId: string) {
  const stats = await queueStats(db, companyId);
  const sum = (status: string, type?: string) =>
    stats
      .filter((s) => s.status === status && (!type || s.type === type))
      .reduce((a, s) => a + s.n, 0);
  const runs = await db
    .select()
    .from(analysisRuns)
    .where(eq(analysisRuns.companyId, companyId))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(8);
  const custNames = new Map(
    (
      await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(eq(customers.companyId, companyId))
    ).map((c) => [c.id, c.name]),
  );
  const [counts] = await db.execute<{
    messages: number;
    tasks: number;
    signals: number;
    suggestions: number;
  }>(sql`
    select (select count(*)::int from messages where company_id = ${companyId}) as messages,
      (select count(*)::int from tasks where company_id = ${companyId}) as tasks,
      (select count(*)::int from signals where company_id = ${companyId} and status = 'open') as signals,
      (select count(*)::int from suggestions where company_id = ${companyId} and status = 'pending') as suggestions`);
  const failed = await db
    .select({ type: jobs.type, error: jobs.lastError, at: jobs.updatedAt })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), inArray(jobs.status, ["failed"])))
    .orderBy(desc(jobs.updatedAt))
    .limit(3);
  return {
    queue: {
      pending: sum("pending"),
      running: sum("running"),
      failed: sum("failed"),
      done: sum("done"),
    },
    replayLeft: sum("pending", "replay_message") + sum("running", "replay_message"),
    replayTotal: replayMessages.length,
    counts: {
      messages: Number(counts?.messages ?? 0),
      tasks: Number(counts?.tasks ?? 0),
      signals: Number(counts?.signals ?? 0),
      suggestions: Number(counts?.suggestions ?? 0),
    },
    failedJobs: failed,
    runs: runs.map((r) => ({
      id: r.id,
      task: r.task,
      customer: r.customerId ? (custNames.get(r.customerId) ?? null) : null,
      provider: r.provider,
      model: r.model,
      tokens: r.inputTokens + r.outputTokens,
      latencyMs: r.latencyMs,
      ok: r.ok,
      at: r.createdAt,
    })),
  };
}

export const DEMO_MAX_AGE_HOURS = 12;

/**
 * Worker start in DEMO_MODE: a scenario loaded more than 12 h ago is re-seeded relative to now,
 * so "yesterday" is really yesterday on stage. Returns what happened for the log.
 */
export async function refreshStaleDemo(
  db: Db,
  now = new Date(),
  maxAgeHours = DEMO_MAX_AGE_HOURS,
): Promise<{ action: "none" | "reseeded"; ageHours: number | null; companyId: string | null }> {
  const companyId = await findDemoCompanyId(db);
  if (!companyId) return { action: "none", ageHours: null, companyId: null };
  const [row] = await db
    .select({ loadedAt: sql<string | null>`min(${messages.createdAt})` })
    .from(messages)
    .where(eq(messages.companyId, companyId));
  if (!row?.loadedAt) return { action: "none", ageHours: null, companyId };
  const ageHours = (now.getTime() - new Date(row.loadedAt).getTime()) / 3_600_000;
  if (ageHours <= maxAgeHours) return { action: "none", ageHours, companyId };
  await cancelPending(db, "replay_message", companyId);
  await resetDemoData(db, companyId);
  await loadYesterday(db, companyId, now);
  // Messages queue their own analysis; make sure every customer gets one.
  const all = await db.select({ id: customers.id }).from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) {
    await enqueue(db, {
      type: "analyze_customer",
      companyId,
      payload: { companyId, customerId: c.id },
      dedupeKey: `analyze:${c.id}`,
      debounceMs: 500,
    });
  }
  return { action: "reseeded", ageHours, companyId };
}
