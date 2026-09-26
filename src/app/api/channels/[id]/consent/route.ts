import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, companies } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { enqueue } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

/** Posts the monitoring consent notice into a connected Telegram group (one click, human-initiated). */
export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "manage:sources");
  const channelId = z.string().uuid().parse(params.id);
  const db = getDb();
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.companyId, ctx.companyId)));
  if (!ch) throw new HttpError(404, "channel not found");
  if (ch.source !== "telegram")
    throw new HttpError(400, "only Telegram groups can receive the notice");
  if (!env().telegram.token) throw new HttpError(400, "Telegram bot is not configured");
  const [company] = await db.select().from(companies).where(eq(companies.id, ctx.companyId));
  await enqueue(db, {
    type: "telegram_send",
    companyId: ctx.companyId,
    payload: {
      companyId: ctx.companyId,
      channelId: ch.id,
      text: company!.settings.consentText,
      kind: "consent",
      userId: ctx.userId,
    },
  });
  await audit({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "consent_posted",
    target: ch.id,
  });
  return NextResponse.json({ ok: true });
});
