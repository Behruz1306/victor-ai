// Runtime LLM mode: "auto" (provider chain) or "offline" (mock only). Flipped from the demo
// control room without a restart; web and worker both read it (cached for a few seconds).
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { systemState } from "@/lib/db/schema";

export type LlmMode = "auto" | "offline";

const KEY = "llm_mode";
const TTL_MS = 3_000;
let cached: { mode: LlmMode; at: number } | null = null;

export async function getLlmMode(db: Db): Promise<LlmMode> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.mode;
  let mode: LlmMode = "auto";
  try {
    const [row] = await db.select().from(systemState).where(eq(systemState.key, KEY));
    mode = row?.value?.mode === "offline" ? "offline" : "auto";
  } catch {
    // table missing during first migration: behave as auto
  }
  cached = { mode, at: Date.now() };
  return mode;
}

export async function setLlmMode(db: Db, mode: LlmMode, by: string | null): Promise<void> {
  const value = { mode, by, at: new Date().toISOString() };
  await db
    .insert(systemState)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: systemState.key, set: { value, updatedAt: sql`now()` } });
  cached = { mode, at: Date.now() };
}
