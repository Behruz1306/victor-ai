import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { canSeeCustomer } from "@/lib/queries/scope";
import { customerDetail } from "@/lib/queries/dispatcher";

export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "view:dispatcher");
  const id = z.string().uuid().parse(params.id);
  const db = getDb();
  if (!(await canSeeCustomer(db, ctx, id))) throw new HttpError(404, "not found");
  const detail = await customerDetail(db, ctx.companyId, id);
  if (!detail) throw new HttpError(404, "not found");
  return NextResponse.json(detail);
});
