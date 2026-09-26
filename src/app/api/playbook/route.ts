import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { playbookData } from "@/lib/queries/playbook";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:playbook");
  return NextResponse.json(await playbookData(getDb(), ctx.companyId));
});
