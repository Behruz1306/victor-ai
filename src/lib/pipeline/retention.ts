import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { analysisRuns, companies, messages } from "@/lib/db/schema";

/** Deletes messages older than each company's retention setting (default 90 days). */
export async function retentionCleanup(db: Db, now = new Date()): Promise<number> {
  const all = await db.select({ id: companies.id, settings: companies.settings }).from(companies);
  let deleted = 0;
  for (const c of all) {
    const days = c.settings.retentionDays > 0 ? c.settings.retentionDays : 90;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const rows = await db
      .delete(messages)
      .where(and(eq(messages.companyId, c.id), lt(messages.sentAt, cutoff)))
      .returning({ id: messages.id });
    await db
      .delete(analysisRuns)
      .where(
        and(
          eq(analysisRuns.companyId, c.id),
          lt(analysisRuns.createdAt, sql`now() - interval '365 days'`),
        ),
      );
    deleted += rows.length;
  }
  if (deleted) console.log(`[retention] deleted ${deleted} messages past retention`);
  return deleted;
}
