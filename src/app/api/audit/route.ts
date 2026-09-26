import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { auditEntries } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:audit");
  return NextResponse.json({ entries: await auditEntries(getDb(), ctx.companyId) });
});
