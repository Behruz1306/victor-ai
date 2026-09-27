import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";
import { getSession } from "./session";
import { can, homeFor, type Permission } from "./rbac";

export type Ctx = {
  userId: string;
  companyId: string;
  role: Role;
  name: string;
  email: string;
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Loads the session user fresh from the DB so deactivation takes effect immediately. */
export async function currentUser(): Promise<Ctx | null> {
  const session = await getSession();
  if (!session.userId || !session.companyId) return null;
  const [u] = await getDb()
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, session.userId),
        eq(users.companyId, session.companyId),
        eq(users.active, true),
      ),
    )
    .limit(1);
  if (!u) return null;
  return { userId: u.id, companyId: u.companyId, role: u.role, name: u.name, email: u.email };
}

/** For server components/pages: redirects instead of throwing. */
export async function requirePage(permission: Permission): Promise<Ctx> {
  const ctx = await currentUser();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, permission)) redirect(homeFor(ctx.role));
  return ctx;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF defense for cookie-authenticated mutations: the request must come from our own origin. */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    const o = new URL(origin).host;
    if (host && o === host) return true;
    // Behind a proxy that rewrites Host: our own configured public origin is same-origin too.
    return o === new URL(env().appUrl).host;
  } catch {
    return false;
  }
}

/** For route handlers: the single guard every API route calls first. */
export async function guardApi(req: Request, permission: Permission): Promise<Ctx> {
  if (MUTATING.has(req.method) && !isSameOrigin(req.headers)) {
    throw new HttpError(403, "cross-origin request rejected");
  }
  const ctx = await currentUser();
  if (!ctx) throw new HttpError(401, "unauthorized");
  if (!can(ctx.role, permission)) throw new HttpError(403, "forbidden");
  return ctx;
}

type Handler<P> = (req: Request, params: P) => Promise<Response>;

/** Wraps a route handler: maps HttpError/ZodError to JSON responses, hides internals. */
export function handle<P = unknown>(fn: Handler<P>) {
  return async (req: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      return await fn(req, await context.params);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "invalid input", issues: err.issues }, { status: 400 });
      }
      console.error("[api] unhandled error", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  };
}
