import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";
import type { Ctx } from "@/lib/auth/guard";

/**
 * Customers a user may see. Dispatchers: only their own. Leads/owners: all, or one
 * dispatcher's queue when `asUserId` is given. Always scoped by company.
 */
export async function visibleCustomers(db: Db, ctx: Ctx, asUserId?: string | null) {
  const own = ctx.role === "dispatcher" ? ctx.userId : (asUserId ?? null);
  return db
    .select()
    .from(customers)
    .where(
      own
        ? and(eq(customers.companyId, ctx.companyId), eq(customers.assignedUserId, own))
        : eq(customers.companyId, ctx.companyId),
    )
    .orderBy(customers.name);
}

export async function canSeeCustomer(db: Db, ctx: Ctx, customerId: string): Promise<boolean> {
  const [c] = await db
    .select({ assigned: customers.assignedUserId })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, ctx.companyId)));
  if (!c) return false;
  return ctx.role !== "dispatcher" || c.assigned === ctx.userId;
}
