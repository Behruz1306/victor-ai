import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handle, HttpError, isSameOrigin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";

export const POST = handle(async (req) => {
  if (!isSameOrigin(req.headers)) throw new HttpError(403, "cross-origin request rejected");
  const session = await getSession();
  if (session.userId && session.companyId) {
    await audit({ companyId: session.companyId, userId: session.userId, action: "logout" });
  }
  session.destroy();
  return NextResponse.json({ ok: true });
});
