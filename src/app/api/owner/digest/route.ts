import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { runSla } from "@/lib/pipeline/sla-apply";
import { generateOwnerDigest } from "@/lib/pipeline/digest";

/** On-demand refresh: SLA pass first so the digest reflects this minute, then regenerate. */
export const POST = handle(async (req) => {
  const ctx = await guardApi(req, "view:owner");
  const db = getDb();
  await runSla(db, ctx.companyId);
  const items = await generateOwnerDigest(db, ctx.companyId);
  return NextResponse.json({ count: items.length });
});
