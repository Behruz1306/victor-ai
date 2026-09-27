import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { getDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { SourcesView } from "./sources-view";

export const metadata = { title: "Sources" };

export default async function SourcesPage() {
  const ctx = await requirePage("view:sources");
  const [company] = await getDb().select().from(companies).where(eq(companies.id, ctx.companyId));
  return <SourcesView timezone={company!.timezone} canManage={can(ctx.role, "manage:sources")} />;
}
