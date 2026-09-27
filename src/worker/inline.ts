// INLINE_WORKER=true: single-service hosting (e.g. a platform that runs one Next.js process).
// On server start: migrations (incl. CREATE EXTENSION vector) → demo seed on an empty database
// (DEMO_MODE) → the worker engine inside this process. Called once from src/instrumentation.ts.
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { runMigrations } from "@/lib/db/migrate";
import { env } from "@/lib/env";
import { seedDemo } from "@/lib/demo/seed";
import { drainJobs } from "./runner";
import { startEngine } from "./engine";

type InlineState = { started: boolean; ready: boolean; error: string | null; seeded: boolean };
const g = globalThis as unknown as { __victorInline?: InlineState };

export function inlineState(): InlineState | null {
  return g.__victorInline ?? null;
}

export async function startInlineWorker(): Promise<void> {
  if (g.__victorInline?.started) return;
  const state: InlineState = { started: true, ready: false, error: null, seeded: false };
  g.__victorInline = state;
  const db = getDb();
  try {
    const t0 = Date.now();
    await db.execute(sql`create extension if not exists vector`);
    await runMigrations();
    console.log(`[inline] migrations applied in ${Date.now() - t0} ms`);

    if (env().demoMode) {
      const [any] = await db.select({ id: companies.id }).from(companies).limit(1);
      if (!any) {
        const { companyId, messages } = await seedDemo(db);
        state.seeded = true;
        console.log(`[inline] empty database — demo company seeded (${messages} raw messages, ${companyId})`);
        // Run the pipeline in the background; the page is usable while it works.
        void drainJobs(db)
          .then((n) => console.log(`[inline] demo pipeline ran: ${n} jobs`))
          .catch((err: unknown) => console.error("[inline] demo pipeline failed", err instanceof Error ? err.message : err));
      }
    }

    await startEngine(db, { inline: true });
    state.ready = true;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    console.error("[inline] start failed:", state.error);
  }
}
