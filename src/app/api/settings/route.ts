import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, SIGNAL_KINDS } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { settingsData } from "@/lib/queries/settings";
import { rerouteOpenSignals, runSla, scheduleOwnerDigest } from "@/lib/pipeline/sla-apply";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const ctx = await guardApi(req, "view:settings");
  const data = await settingsData(getDb(), ctx.companyId);
  if (!data) throw new HttpError(404, "company not found");
  return NextResponse.json(data);
});

const minutes = z.number().int().min(0).max(7 * 24 * 60);
const Body = z.object({
  sla: z
    .object({
      ackMinutes: minutes.min(1),
      etaAnswerMinutes: minutes.min(1),
      deadlineRequiredMinutes: minutes.min(1),
      deadlineGraceMinutes: minutes,
      customerSilentDays: z.number().int().min(1).max(365),
    })
    .optional(),
  settings: z
    .object({
      sendMode: z.enum(["copy", "bot"]),
      retentionDays: z.number().int().min(1).max(3650),
      consentText: z.string().trim().min(10).max(1000),
      signWithName: z.boolean(),
    })
    .optional(),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().trim().min(1).max(200),
        kinds: z.array(z.enum(SIGNAL_KINDS)).min(1),
        customerIds: z.array(z.string().uuid()).max(50),
        minSeverity: z.number().int().min(1).max(5),
      }),
    )
    .max(20)
    .optional(),
});

export const POST = handle(async (req) => {
  const ctx = await guardApi(req, "manage:settings");
  const body = Body.parse(await req.json());
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, ctx.companyId));
  if (!company) throw new HttpError(404, "company not found");
  await db
    .update(companies)
    .set({
      ...(body.sla ? { sla: { ...company.sla, ...body.sla } } : {}),
      ...(body.settings ? { settings: { ...company.settings, ...body.settings } } : {}),
      ...(body.criteria ? { watchCriteria: { ...company.watchCriteria, items: body.criteria, updatedAt: new Date().toISOString() } } : {}),
    })
    .where(eq(companies.id, ctx.companyId));
  await audit({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "settings_changed",
    target: Object.keys(body).join(","),
    meta: { sla: body.sla ?? null, settings: body.settings ? { ...body.settings, consentText: undefined } : null, criteria: body.criteria?.length ?? null },
  });
  if (body.criteria) await rerouteOpenSignals(db, ctx.companyId);
  if (body.sla) await runSla(db, ctx.companyId);
  if (body.criteria || body.sla) await scheduleOwnerDigest(db, ctx.companyId);
  return NextResponse.json({ ok: true });
});
