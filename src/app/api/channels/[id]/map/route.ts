import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  CHAT_TYPES,
  channels,
  customers,
  messages,
  participants,
  tasks,
  users,
} from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { sideFor } from "@/lib/ingest/normalize";
import { enqueue } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";

const Body = z.object({
  chatType: z.enum(CHAT_TYPES),
  customerId: z.string().uuid().nullable().optional(),
  newCustomerName: z.string().trim().min(2).max(120).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
});

export const POST = handle<{ id: string }>(async (req, params) => {
  const ctx = await guardApi(req, "manage:sources");
  const channelId = z.string().uuid().parse(params.id);
  const body = Body.parse(await req.json());
  const db = getDb();
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.companyId, ctx.companyId)));
  if (!ch) throw new HttpError(404, "channel not found");

  let customerId: string | null = null;
  if (body.newCustomerName) {
    if (body.assignedUserId) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, body.assignedUserId), eq(users.companyId, ctx.companyId)));
      if (!u) throw new HttpError(400, "unknown dispatcher");
    }
    const [c] = await db
      .insert(customers)
      .values({
        companyId: ctx.companyId,
        name: body.newCustomerName,
        kind: "broker",
        assignedUserId: body.assignedUserId ?? null,
      })
      .returning({ id: customers.id });
    customerId = c!.id;
  } else if (body.customerId) {
    const [c] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, body.customerId), eq(customers.companyId, ctx.companyId)));
    if (!c) throw new HttpError(400, "unknown customer");
    customerId = c.id;
  }
  if (!customerId && ["customer", "billing", "support"].includes(body.chatType)) {
    throw new HttpError(400, "customer-facing chats need a customer");
  }

  await db
    .update(channels)
    .set({ chatType: body.chatType, customerId })
    .where(eq(channels.id, ch.id));
  // Senders seen before mapping get their side now.
  const senderIds = await db
    .selectDistinct({ id: messages.participantId })
    .from(messages)
    .where(eq(messages.channelId, ch.id));
  const ids = senderIds.map((s) => s.id).filter(Boolean) as string[];
  if (ids.length) {
    const unknown = await db
      .select()
      .from(participants)
      .where(and(inArray(participants.id, ids), eq(participants.side, "unknown")));
    for (const p of unknown) {
      await db
        .update(participants)
        .set({ side: sideFor({ linkedUser: Boolean(p.userId), chatType: body.chatType }) })
        .where(eq(participants.id, p.id));
    }
  }

  const toAnalyze = customerId
    ? [customerId]
    : [
        ...new Set(
          (
            await db
              .select({ id: tasks.customerId })
              .from(tasks)
              .where(
                and(
                  eq(tasks.companyId, ctx.companyId),
                  notInArray(tasks.status, ["delivered", "cancelled"]),
                ),
              )
          ).map((r) => r.id),
        ),
      ];
  for (const cid of toAnalyze) {
    await enqueue(db, {
      type: "analyze_customer",
      companyId: ctx.companyId,
      payload: { companyId: ctx.companyId, customerId: cid },
      dedupeKey: `analyze:${cid}`,
      debounceMs: 1000,
    });
  }
  await audit({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "channel_mapped",
    target: ch.id,
    meta: { title: ch.title, chatType: body.chatType, customerId },
  });
  return NextResponse.json({ ok: true, customerId });
});
