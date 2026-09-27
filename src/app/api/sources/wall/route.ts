import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { sourcesWall } from "@/lib/queries/sources";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:sources");
  return NextResponse.json(await sourcesWall(getDb(), ctx.companyId));
});
