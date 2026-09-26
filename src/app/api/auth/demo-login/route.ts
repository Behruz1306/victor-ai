import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, companies, ROLES } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/rbac";
import { handle, HttpError, isSameOrigin } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const Body = z.object({ role: z.enum(ROLES) });

/** One-click demo sign-in. Only exists when DEMO_MODE=true and only for the demo company. */
export const POST = handle(async (req) => {
  if (!env().demoMode) throw new HttpError(404, "not found");
  if (!isSameOrigin(req.headers)) throw new HttpError(403, "cross-origin request rejected");
  const { role } = Body.parse(await req.json());
  const [user] = await getDb()
    .select({ user: users })
    .from(users)
    .innerJoin(companies, eq(companies.id, users.companyId))
    .where(and(eq(companies.isDemo, true), eq(users.role, role), eq(users.active, true)))
    .orderBy(asc(users.name))
    .limit(1);
  if (!user) throw new HttpError(404, "demo company not seeded — run pnpm seed");
  const u = user.user;
  const session = await getSession();
  session.userId = u.id;
  session.companyId = u.companyId;
  session.role = u.role;
  session.issuedAt = Date.now();
  await session.save();
  await audit({ companyId: u.companyId, userId: u.id, action: "login", meta: { method: "demo" } });
  return NextResponse.json({ home: homeFor(u.role) });
});
