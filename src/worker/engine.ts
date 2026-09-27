// The worker engine: job runner, scheduler (SLA, retention, heartbeat) and the Telegram long poll.
// Runs as its own process (src/worker/main.ts, Docker) or inside the web process
// (INLINE_WORKER=true, src/worker/inline.ts) for single-service hosts.
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { systemState } from "@/lib/db/schema";
import { recoverStaleJobs, enqueueOnce } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { providerChain } from "@/lib/llm/providers";
import { tryHoldLock, type HeldLock } from "@/lib/db/lock";
import { DEMO_MAX_AGE_HOURS, refreshStaleDemo } from "@/lib/demo/control";
import { audit } from "@/lib/audit";
import { runOnce } from "./runner";
import { startBot, type RunningBot } from "./telegram";
import { schedulerTick } from "./scheduler";

export type Engine = { stop: () => Promise<void> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startEngine(db: Db, opts: { inline: boolean }): Promise<Engine> {
  let running = true;
  let telegram: RunningBot | null = null;
  let pollerLock: HeldLock | null = null;
  const mode = opts.inline ? "inline" : "process";

  async function heartbeat() {
    // File heartbeat for the container healthcheck; DB heartbeat for the Settings/Demo screens.
    try {
      writeFileSync("/tmp/victor-worker-heartbeat", new Date().toISOString());
    } catch {
      // read-only filesystem: the DB heartbeat still works
    }
    const value = {
      at: new Date().toISOString(),
      pid: process.pid,
      mode,
      llm: providerChain()[0]!.id,
    };
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

  /**
   * Only one worker may long-poll a bot token (Telegram answers a second getUpdates consumer with
   * 409 Conflict). The advisory lock picks the poller; other workers stay on standby and take over
   * within 15 s if the poller dies.
   */
  async function telegramLoop() {
    if (!env().telegram.token) {
      await startBot(db).catch(() => null); // records "not configured" for Settings
      return;
    }
    let standbyLogged = false;
    while (running) {
      try {
        if (!telegram) {
          pollerLock ??= await tryHoldLock("victor:telegram-long-poll");
          if (!pollerLock) {
            if (!standbyLogged)
              console.log("[telegram] another worker holds the long poll — standing by");
            standbyLogged = true;
          } else {
            telegram = await startBot(db);
            const current = telegram;
            void current?.done.then(() => {
              // Polling ended (conflict, revoked token, stop): retry on the next tick.
              if (telegram === current) telegram = null;
            });
          }
        } else {
          await telegram.persist();
        }
      } catch (err) {
        console.error("[telegram] failed to start:", err instanceof Error ? err.message : err);
        telegram = null;
      }
      for (let i = 0; i < 15 && running; i++) await sleep(1000);
    }
  }

  /** DEMO_MODE: a scenario older than 12 h is re-seeded so "yesterday" is really yesterday. */
  async function refreshDemoOnStart() {
    const lock = await tryHoldLock("victor:demo-reseed").catch(() => null);
    if (!lock) return; // another worker is doing it
    try {
      const r = await refreshStaleDemo(db);
      if (r.action === "reseeded") {
        console.log(
          `[demo] scenario was loaded ${r.ageHours!.toFixed(1)} h ago (> ${DEMO_MAX_AGE_HOURS} h) — re-seeded relative to now; analysis queued`,
        );
        await audit({
          companyId: r.companyId!,
          userId: null,
          action: "demo_reseeded",
          meta: { ageHours: Math.round(r.ageHours!) },
        });
      } else if (r.ageHours !== null) {
        console.log(`[demo] scenario is fresh (loaded ${r.ageHours.toFixed(1)} h ago)`);
      }
    } catch (err) {
      console.error("[demo] freshness check failed:", err instanceof Error ? err.message : err);
    } finally {
      await lock.release();
    }
  }

  const chain = providerChain()
    .map((p) => (p.kind === "mock" ? p.id : `${p.id}:${p.model}`))
    .join(" → ");
  console.log(`[worker] starting ${mode} (llm=${chain}, demo=${env().demoMode})`);
  for (const w of env().warnings) console.warn(`[config] ${w}`);
  const recovered = await recoverStaleJobs(db);
  if (recovered) console.log(`[worker] recovered ${recovered} stale jobs`);
  await enqueueOnce(db, {
    type: "retention_cleanup",
    payload: {},
    dedupeKey: `retention:${new Date().toISOString().slice(0, 10)}`,
    delayMs: 60_000,
  });
  if (env().demoMode) await refreshDemoOnStart();

  const loops = Promise.all([jobLoop(), schedulerLoop(), telegramLoop()]).catch((err: unknown) =>
    console.error("[worker] loop crashed", err instanceof Error ? err.message : err),
  );

  return {
    stop: async () => {
      if (!running) return;
      running = false;
      await telegram?.stop().catch(() => {});
      await pollerLock?.release();
      await Promise.race([loops, sleep(3000)]);
    },
  };
}
