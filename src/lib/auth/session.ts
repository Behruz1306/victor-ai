import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Role } from "@/lib/db/schema";

export type SessionData = {
  userId?: string;
  companyId?: string;
  role?: Role;
  issuedAt?: number;
};

export const SESSION_COOKIE = "pulse_session";

export function sessionOptions(): SessionOptions {
  const e = env();
  return {
    password: e.sessionSecret,
    cookieName: SESSION_COOKIE,
    ttl: 60 * 60 * 12,
    cookieOptions: {
      httpOnly: true,
      secure: e.isProd && e.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}
