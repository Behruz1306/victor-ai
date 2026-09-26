import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { ownerOverview } from "@/lib/queries/owner";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:owner");
  return NextResponse.json(await ownerOverview(getDb(), ctx.companyId));
});
