import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/** Wipes all tenant data between integration tests (test database only). */
export async function resetDatabase(): Promise<void> {
  const db = getDb();
  if (!/victor_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing to wipe a non-test database");
  await db.execute(sql`truncate companies, jobs, system_state restart identity cascade`);
}
