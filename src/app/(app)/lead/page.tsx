import { and, asc, eq, inArray } from "drizzle-orm";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { LeadView } from "./lead-view";

export const metadata = { title: "Team lead" };

export default async function LeadPage() {
  const ctx = await requirePage("view:lead");
  const staff = await getDb()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.companyId, ctx.companyId),
        eq(users.active, true),
        inArray(users.role, ["dispatcher", "lead"]),
      ),
    )
    .orderBy(asc(users.name));
  return <LeadView canHandoff={can(ctx.role, "manage:handoff")} staff={staff} />;
}
