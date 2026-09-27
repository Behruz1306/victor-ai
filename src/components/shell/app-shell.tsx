import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { navFor } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import type { Ctx } from "@/lib/auth/guard";
import type { Lang } from "@/lib/types";
import { shellStatus } from "@/lib/queries/shell";
import { Shell } from "./sidebar";

export async function AppShell({
  ctx,
  children,
}: {
  ctx: Ctx;
  lang: Lang;
  children: React.ReactNode;
}) {
  const e = env();
  const db = getDb();
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));
  const status = await shellStatus(db, ctx.companyId);
  return (
    <Shell
      user={{ name: ctx.name, role: ctx.role }}
      company={company?.name ?? ""}
      items={navFor(ctx.role, e.demoMode).map((n) => ({ href: n.href, key: n.key }))}
      demoMode={e.demoMode}
      initialStatus={JSON.parse(JSON.stringify(status))}
    >
      {children}
    </Shell>
  );
}
