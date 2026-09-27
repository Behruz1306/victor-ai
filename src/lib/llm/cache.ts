// Demo response cache: rehearsing "Reset → Load yesterday" replays identical prompts, so the
// second run costs no provider requests. Keyed by task + instructions + prompt without the clock
// line (the seed is anchored to the local day, so every other line repeats within a day).
import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { llmCache } from "@/lib/db/schema";

const TTL_DAYS = 7;

export function cacheKey(task: string, instructions: string, prompt: string): string {
  const stable = prompt.replace(/^NOW: .*$/m, "NOW: <clock>");
  return createHash("sha256").update(`${task}\n${instructions}\n${stable}`).digest("hex");
}

export async function cacheGet(
  db: Db,
  key: string,
): Promise<{ output: unknown; provider: string; model: string } | null> {
  const [row] = await db.select().from(llmCache).where(eq(llmCache.key, key));
  if (!row) return null;
  if (Date.now() - row.createdAt.getTime() > TTL_DAYS * 86_400_000) return null;
  await db
    .update(llmCache)
    .set({ hits: sql`${llmCache.hits} + 1` })
    .where(eq(llmCache.key, key));
  return { output: row.output, provider: row.provider, model: row.model };
}

export async function cachePut(
  db: Db,
  row: { key: string; task: string; provider: string; model: string; output: unknown },
): Promise<void> {
  await db
    .insert(llmCache)
    .values(row)
    .onConflictDoUpdate({
      target: llmCache.key,
      set: { output: row.output, provider: row.provider, model: row.model, createdAt: new Date() },
    });
  await db
    .delete(llmCache)
    .where(lt(llmCache.createdAt, new Date(Date.now() - TTL_DAYS * 86_400_000)));
}
