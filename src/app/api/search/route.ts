import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { searchIndex } from "@/lib/queries/shell";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:dispatcher");
  return NextResponse.json(await searchIndex(getDb(), ctx));
});
