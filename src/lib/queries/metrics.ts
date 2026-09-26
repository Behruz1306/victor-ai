import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { suggestions } from "@/lib/db/schema";

export type EditRate = { approved: number; edited: number; rate: number | null };

/** edited / (approved + edited) over a rolling window. Real decisions only. */
export async function editRate(
  db: Db,
  companyId: string,
  opts: { userId?: string; customerId?: string; days?: number } = {},
): Promise<EditRate> {
  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
  const conds = [
    eq(suggestions.companyId, companyId),
    inArray(suggestions.status, ["approved", "edited"]),
    gte(suggestions.decidedAt, since),
  ];
  if (opts.userId) conds.push(eq(suggestions.decidedBy, opts.userId));
  if (opts.customerId) conds.push(eq(suggestions.customerId, opts.customerId));
  const [row] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${suggestions.status} = 'approved')::int`,
      edited: sql<number>`count(*) filter (where ${suggestions.status} = 'edited')::int`,
    })
    .from(suggestions)
    .where(and(...conds));
  const approved = Number(row?.approved ?? 0);
  const edited = Number(row?.edited ?? 0);
  return { approved, edited, rate: approved + edited ? edited / (approved + edited) : null };
}

/** Edit rate grouped by a column (decided_by or customer_id). */
export async function editRateBy(
  db: Db,
  companyId: string,
  by: "decided_by" | "customer_id",
  days = 30,
): Promise<Map<string, EditRate>> {
  const rows = await db.execute<{ key: string; approved: number; edited: number }>(sql`
    select ${sql.raw(by)} as key,
      count(*) filter (where status = 'approved')::int as approved,
      count(*) filter (where status = 'edited')::int as edited
    from suggestions
    where company_id = ${companyId} and status in ('approved','edited')
      and decided_at >= now() - (${days}::int * interval '1 day') and ${sql.raw(by)} is not null
    group by 1`);
  return new Map(
    rows.map((r) => {
      const a = Number(r.approved);
      const e = Number(r.edited);
      return [r.key, { approved: a, edited: e, rate: a + e ? e / (a + e) : null }];
    }),
  );
}

/** Daily edit rate for the chart (company-local days). */
export async function editRateDaily(db: Db, companyId: string, timezone: string, days = 14) {
  const rows = await db.execute<{ day: string; approved: number; edited: number }>(sql`
    select to_char(decided_at at time zone ${timezone}, 'YYYY-MM-DD') as day,
      count(*) filter (where status = 'approved')::int as approved,
      count(*) filter (where status = 'edited')::int as edited
    from suggestions
    where company_id = ${companyId} and status in ('approved','edited')
      and decided_at >= now() - (${days}::int * interval '1 day')
    group by 1 order by 1`);
  return rows.map((r) => {
    const a = Number(r.approved);
    const e = Number(r.edited);
    return {
      day: r.day,
      approved: a,
      edited: e,
      rate: a + e ? Math.round((e / (a + e)) * 100) : null,
    };
  });
}
