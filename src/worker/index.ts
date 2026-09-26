// Worker process: Telegram long polling, job runner, scheduler (SLA loop, retention, heartbeat).
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "@/lib/db/client";
import { systemState } from "@/lib/db/schema";
import { recoverStaleJobs, enqueueOnce } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { runOnce } from "./runner";
import { startBot } from "./telegram";
import { schedulerTick } from "./scheduler";

const db = getDb();
let running = true;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function heartbeat() {
  const value = { at: new Date().toISOString(), pid: process.pid, llm: env().llm.provider };
  await db
    .insert(systemState)
    .values({ key: "worker_heartbeat", value })
    .onConflictDoUpdate({ target: systemState.key, set: { value, updatedAt: sql`now()` } });
}

async function jobLoop() {
  while (running) {
    try {
      const ran = await runOnce(db);
      if (!ran) await sleep(750);
    } catch (err) {
      console.error("[worker] job loop error", err instanceof Error ? err.message : err);
      await sleep(3000);
    }
  }
}

async function schedulerLoop() {
  while (running) {
    try {
      await heartbeat();
      await schedulerTick(db);
    } catch (err) {
      console.error("[worker] scheduler error", err instanceof Error ? err.message : err);
    }
    for (let i = 0; i < 30 && running; i++) await sleep(1000);
  }
}

async function main() {
  console.log(`[worker] starting (llm=${env().llm.provider}, demo=${env().demoMode})`);
  const recovered = await recoverStaleJobs(db);
  if (recovered) console.log(`[worker] recovered ${recovered} stale jobs`);
  await enqueueOnce(db, {
    type: "retention_cleanup",
    payload: {},
    dedupeKey: `retention:${new Date().toISOString().slice(0, 10)}`,
    delayMs: 60_000,
  });
  const bot = await startBot(db).catch((err: unknown) => {
    console.error("[telegram] failed to start:", err instanceof Error ? err.message : err);
    return null;
  });

  const stop = async (signal: string) => {
    if (!running) return;
    console.log(`[worker] ${signal} — shutting down`);
    running = false;
    await bot?.stop().catch(() => {});
    await sleep(500);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));

  await Promise.all([jobLoop(), schedulerLoop()]);
}

main().catch(async (err: unknown) => {
  console.error("[worker] fatal", err);
  await closeDb();
  process.exit(1);
});
