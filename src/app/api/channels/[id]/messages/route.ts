import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { channelMessages } from "@/lib/queries/sources";

export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "view:sources");
  const id = z.string().uuid().parse(params.id);
  return NextResponse.json({ messages: await channelMessages(getDb(), ctx.companyId, id) });
});
