// Fixed-window limiter for login attempts, stored in Postgres so every web instance shares it
// (a process-memory limiter would reset on restart and multiply with each instance).
import { lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";

export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export type LoginLimiter = {
  /** Counts the attempt; true when it is allowed. */
  hit: (key: string) => Promise<boolean>;
  reset: (key: string) => Promise<void>;
};

export function dbLoginLimiter(db: Db, limit = LOGIN_LIMIT, windowMs = LOGIN_WINDOW_MS): LoginLimiter {
  return {
    hit: async (key) => {
      const window = `${Math.round(windowMs / 1000)} seconds`;
      const rows = await db.execute<{ count: number }>(sql`
        insert into login_attempts (key, count, reset_at)
        values (${key}, 1, now() + ${window}::interval)
        on conflict (key) do update set
          count = case when login_attempts.reset_at <= now() then 1 else login_attempts.count + 1 end,
          reset_at = case when login_attempts.reset_at <= now()
                          then now() + ${window}::interval else login_attempts.reset_at end
        returning count`);
      // Opportunistic cleanup of long-expired windows.
      if (Math.random() < 0.05) {
        await db.delete(loginAttempts).where(lt(loginAttempts.resetAt, sql`now() - interval '1 day'`));
      }
      return Number(rows[0]?.count ?? 1) <= limit;
    },
    reset: async (key) => {
      await db.execute(sql`delete from login_attempts where key = ${key}`);
    },
  };
}
