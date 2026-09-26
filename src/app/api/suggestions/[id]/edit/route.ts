import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { editSuggestion } from "@/lib/pipeline/suggestion-actions";

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "act:suggestion");
  const body = Body.parse(await req.json());
  const res = await editSuggestion(getDb(), ctx, z.string().uuid().parse(params.id), body.text, body.reason || null);
  return NextResponse.json(res);
});
