import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { dispatcherProblems } from "@/lib/queries/lead";

export const dynamic = "force-dynamic";

export const GET = handle<{ userId: string }>(async (req, params) => {
  const ctx = await guardApi(req, "view:lead");
  const userId = z.string().uuid().parse(params.userId);
  return NextResponse.json({ problems: await dispatcherProblems(getDb(), ctx.companyId, userId) });
});
