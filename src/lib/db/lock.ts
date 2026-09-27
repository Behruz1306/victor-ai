// Session-level Postgres advisory locks on a dedicated connection: held until release() or
// until the process dies (the connection closes and Postgres frees the lock). Used so that only
// one worker long-polls Telegram (the API allows one getUpdates consumer per bot token).
import postgres from "postgres";
import { databaseUrl } from "./client";

export type HeldLock = { release: () => Promise<void> };

export async function tryHoldLock(name: string): Promise<HeldLock | null> {
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {}, idle_timeout: 0 });
  try {
    const [row] = await sql<
      { ok: boolean }[]
    >`select pg_try_advisory_lock(hashtext(${name})) as ok`;
    if (!row?.ok) {
      await sql.end({ timeout: 2 });
      return null;
    }
  } catch (err) {
    await sql.end({ timeout: 2 }).catch(() => {});
    throw err;
  }
  return {
    release: async () => {
      await sql`select pg_advisory_unlock(hashtext(${name}))`.catch(() => {});
      await sql.end({ timeout: 2 }).catch(() => {});
    },
  };
}
