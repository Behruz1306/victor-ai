import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { createHandoff } from "@/lib/pipeline/handoff";
import { audit } from "@/lib/audit";

const Body = z.object({ fromUserId: z.string().uuid(), toUserId: z.string().uuid() });

export const POST = handle(async (req) => {
  const ctx = await guardApi(req, "manage:handoff");
  const { fromUserId, toUserId } = Body.parse(await req.json());
  if (fromUserId === toUserId) throw new HttpError(400, "pick a different replacement");
  const db = getDb();
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, ctx.companyId), inArray(users.id, [fromUserId, toUserId])));
  if (found.length !== 2) throw new HttpError(400, "unknown users");
  const id = await createHandoff(db, ctx.companyId, fromUserId, toUserId);
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "handoff_created", target: id, meta: { fromUserId, toUserId } });
  return NextResponse.json({ id });
});
