import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { playbookRules } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("edit"), text: z.string().trim().min(3).max(500) }),
]);

/** Lead/owner decide on learned rules: approve a proposed company rule, reject, or reword. */
export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "manage:rules");
  const id = z.string().uuid().parse(params.id);
  const body = Body.parse(await req.json());
  const db = getDb();
  const [rule] = await db.select().from(playbookRules).where(and(eq(playbookRules.id, id), eq(playbookRules.companyId, ctx.companyId)));
  if (!rule) throw new HttpError(404, "rule not found");
  const set =
    body.action === "approve"
      ? { status: "active" as const, decidedBy: ctx.userId }
      : body.action === "reject"
        ? { status: "rejected" as const, decidedBy: ctx.userId }
        : { ruleText: body.text, decidedBy: ctx.userId };
  await db.update(playbookRules).set({ ...set, updatedAt: sql`now()` }).where(eq(playbookRules.id, rule.id));
  await audit({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: body.action === "approve" ? "rule_approved" : body.action === "reject" ? "rule_rejected" : "rule_edited",
    target: rule.id,
    meta: { before: rule.ruleText, ...(body.action === "edit" ? { after: body.text } : {}) },
  });
  return NextResponse.json({ ok: true });
});
