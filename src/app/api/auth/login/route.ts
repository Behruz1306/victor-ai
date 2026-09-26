import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { loginLimiter } from "@/lib/auth/rate-limit";
import { homeFor } from "@/lib/auth/rbac";
import { handle, HttpError, isSameOrigin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const POST = handle(async (req) => {
  if (!isSameOrigin(req.headers)) throw new HttpError(403, "cross-origin request rejected");
  const { email, password } = Body.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!loginLimiter.hit(`${ip}|${email}`)) {
    return NextResponse.json({ error: "too many attempts" }, { status: 429 });
  }
  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  const ok = user && user.active ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    if (user) {
      await audit({ companyId: user.companyId, userId: user.id, action: "login_failed" });
    }
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  loginLimiter.reset(`${ip}|${email}`);
  const session = await getSession();
  session.userId = user.id;
  session.companyId = user.companyId;
  session.role = user.role;
  session.issuedAt = Date.now();
  await session.save();
  await audit({
    companyId: user.companyId,
    userId: user.id,
    action: "login",
    meta: { method: "password" },
  });
  return NextResponse.json({ home: homeFor(user.role) });
});
