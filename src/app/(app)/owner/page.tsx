import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { OwnerView } from "./owner-view";

export const metadata = { title: "Owner" };

export default async function OwnerPage() {
  const ctx = await requirePage("view:owner");
  const [c] = await getDb()
    .select({ tz: companies.timezone })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));
  return <OwnerView timezone={c?.tz ?? "America/Chicago"} />;
}
