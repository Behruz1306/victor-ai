import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, SIGNAL_KINDS } from "@/lib/db/schema";
import { guardApi, handle } from "@/lib/auth/guard";
import { proposeCriteria } from "@/lib/pipeline/criteria";
import { rerouteOpenSignals, scheduleOwnerDigest } from "@/lib/pipeline/sla-apply";
import { audit } from "@/lib/audit";
import { getLang } from "@/lib/i18n/server";

const Propose = z.object({ action: z.literal("propose"), answers: z.array(z.string().trim().max(1000)).length(3) });
const Criterion = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(200),
  kinds: z.array(z.enum(SIGNAL_KINDS)).min(1),
  customerIds: z.array(z.string().uuid()).max(50),
  minSeverity: z.number().int().min(1).max(5),
});
const Save = z.object({ action: z.literal("save"), items: z.array(Criterion).max(20), answers: z.array(z.string().max(1000)).optional() });
const Skip = z.object({ action: z.literal("skip") });
const Body = z.discriminatedUnion("action", [Propose, Save, Skip]);

export const POST = handle(async (req) => {
  const ctx = await guardApi(req, "view:owner");
  const body = Body.parse(await req.json());
  const db = getDb();
  if (body.action === "propose") {
    const items = await proposeCriteria(db, ctx.companyId, body.answers, await getLang());
    return NextResponse.json({ items });
  }
  const [company] = await db.select().from(companies).where(eq(companies.id, ctx.companyId));
  const settings = { ...company!.settings, onboardingDone: true };
  if (body.action === "skip") {
    await db.update(companies).set({ settings }).where(eq(companies.id, ctx.companyId));
    return NextResponse.json({ ok: true });
  }
  await db
    .update(companies)
    .set({ settings, watchCriteria: { items: body.items, answers: body.answers, updatedAt: new Date().toISOString() } })
    .where(eq(companies.id, ctx.companyId));
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "settings_changed", target: "watch_criteria", meta: { count: body.items.length } });
  await rerouteOpenSignals(db, ctx.companyId);
  await scheduleOwnerDigest(db, ctx.companyId);
  return NextResponse.json({ ok: true });
});
