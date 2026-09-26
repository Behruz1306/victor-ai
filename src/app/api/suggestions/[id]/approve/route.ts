import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle } from "@/lib/auth/guard";
import { approveSuggestion } from "@/lib/pipeline/suggestion-actions";

export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "act:suggestion");
  const res = await approveSuggestion(getDb(), ctx, z.string().uuid().parse(params.id));
  return NextResponse.json(res);
});
