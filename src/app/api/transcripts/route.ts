import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, customers, participants, users } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { ingestMessage } from "@/lib/ingest/ingest";
import { parseTranscript } from "@/lib/ingest/normalize";
import { audit } from "@/lib/audit";

const Body = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(200_000),
});

/** Call transcript upload: each "Speaker: text" line becomes a message of source `call`. */
export const POST = handle(async (req) => {
  const ctx = await guardApi(req, "upload:transcript");
  const body = Body.parse(await req.json());
  const db = getDb();
  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, body.customerId), eq(customers.companyId, ctx.companyId)));
  if (!cust) throw new HttpError(404, "customer not found");
  const lines = parseTranscript(body.content);
  if (!lines.length) throw new HttpError(400, "no 'Speaker: text' lines found");
  const staff = await db.select({ name: users.name }).from(users).where(eq(users.companyId, ctx.companyId));
  const staffNames = new Set(staff.map((s) => s.name.toLowerCase()));
  const externalId = `call-${Date.now()}`;
  const title = `Call: ${body.name.replace(/\.txt$/i, "")}`;
  await db.insert(channels).values({
    companyId: ctx.companyId,
    source: "call",
    externalId,
    title,
    chatType: "customer",
    customerId: cust.id,
  });
  const start = Date.now() - lines.length * 20_000;
  for (const [i, l] of lines.entries()) {
    const isStaff = staffNames.has(l.speaker.toLowerCase().split(" ")[0]!) || staffNames.has(l.speaker.toLowerCase());
    if (isStaff) {
      // Our own people on the call are staff, whatever the chat type says.
      await db
        .insert(participants)
        .values({ companyId: ctx.companyId, source: "call", externalId: `staff:${l.speaker.toLowerCase()}`, displayName: l.speaker, side: "employee" })
        .onConflictDoNothing();
    }
    await ingestMessage(db, ctx.companyId, {
      source: "call",
      channelExternalId: externalId,
      channelTitle: title,
      messageExternalId: String(i + 1),
      senderExternalId: `${isStaff ? "staff" : "caller"}:${l.speaker.toLowerCase()}`,
      senderName: l.speaker,
      text: l.text,
      sentAt: new Date(start + i * 20_000),
    });
  }
  await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "transcript_uploaded", target: cust.id, meta: { lines: lines.length } });
  return NextResponse.json({ ok: true, lines: lines.length });
});
