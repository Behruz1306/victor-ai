import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { leadOverview } from "@/lib/queries/lead";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:lead");
  return NextResponse.json({ rows: await leadOverview(getDb(), ctx.companyId) });
});
