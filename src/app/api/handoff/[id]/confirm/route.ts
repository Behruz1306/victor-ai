import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { confirmHandoff } from "@/lib/pipeline/handoff";
import { audit } from "@/lib/audit";

export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "manage:handoff");
  const id = z.string().uuid().parse(params.id);
  const moved = await confirmHandoff(getDb(), ctx.companyId, id);
  if (moved === null) throw new HttpError(409, "handoff not found or already confirmed");
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "handoff_confirmed", target: id, meta: { customers: moved } });
  return NextResponse.json({ moved });
});
