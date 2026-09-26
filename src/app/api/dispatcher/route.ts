import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { dispatcherOverview } from "@/lib/queries/dispatcher";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:dispatcher");
  const as = new URL(req.url).searchParams.get("as");
  const asUserId = as ? z.string().uuid().parse(as) : null;
  return NextResponse.json(await dispatcherOverview(getDb(), ctx, asUserId));
});
