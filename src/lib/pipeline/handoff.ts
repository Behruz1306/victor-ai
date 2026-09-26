import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  channels,
  companies,
  customers,
  dailySummaries,
  handoffs,
  messages,
  participants,
  tasks,
  users,
} from "@/lib/db/schema";
import { generateStructured } from "@/lib/llm";
import { HandoffOut } from "@/lib/llm/schemas";
import { HANDOFF_INSTRUCTIONS, renderHandoffPrompt } from "@/lib/llm/prompts/other";
import type { HandoffBrief } from "@/lib/types";
import type { CtxMessage, HandoffInput } from "./types";

/** Handoff brief (5.6): per chat of every customer of the leaving dispatcher. */
export async function createHandoff(
  db: Db,
  companyId: string,
  fromUserId: string,
  toUserId: string,
  now = new Date(),
): Promise<string> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.companyId, companyId), inArray(users.id, [fromUserId, toUserId])));
  const from = people.find((p) => p.id === fromUserId);
  const to = people.find((p) => p.id === toUserId);
  if (!company || !from || !to) throw new Error("unknown users");

  const custs = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.assignedUserId, fromUserId)));
  const briefs: HandoffBrief[] = [];
  const openCount = await db
    .select({ customerId: tasks.customerId })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), notInArray(tasks.status, ["delivered", "cancelled"])));
  const load = (id: string) => openCount.filter((t) => t.customerId === id).length;
  custs.sort((a, b) => load(b.id) - load(a.id) || a.name.localeCompare(b.name)); // busiest first
  for (const c of custs) {
    const chans = await db
      .select()
      .from(channels)
      .where(and(eq(channels.companyId, companyId), eq(channels.customerId, c.id)));
    if (!chans.length) continue;
    const short = new Map(chans.map((ch, i) => [ch.id, `c${i + 1}`]));
    const rows = await db
      .select({
        m: messages,
        name: participants.displayName,
        side: participants.side,
        userName: users.name,
      })
      .from(messages)
      .leftJoin(participants, eq(participants.id, messages.participantId))
      .leftJoin(users, eq(users.id, participants.userId))
      .where(
        and(
          eq(messages.companyId, companyId),
          inArray(
            messages.channelId,
            chans.map((x) => x.id),
          ),
        ),
      )
      .orderBy(desc(messages.sentAt))
      .limit(60);
    const msgs: CtxMessage[] = rows.reverse().map((r, i) => {
      const ch = chans.find((x) => x.id === r.m.channelId)!;
      return {
        id: `m${i + 1}`,
        dbId: r.m.id,
        channelId: short.get(ch.id)!,
        chatType: ch.chatType ?? "customer",
        channelTitle: ch.title,
        side: r.side ?? "unknown",
        senderName: r.name ?? "unknown",
        userName: r.userName,
        text: r.m.text,
        sentAt: r.m.sentAt,
        untrusted: r.m.untrustedFlag,
        replyToId: null,
      };
    });
    const openTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.customerId, c.id), notInArray(tasks.status, ["delivered", "cancelled"])));
    const summaries = await db
      .select()
      .from(dailySummaries)
      .where(eq(dailySummaries.customerId, c.id))
      .orderBy(desc(dailySummaries.day))
      .limit(3);
    const input: HandoffInput = {
      now,
      timezone: company.timezone,
      fromName: from.name,
      toName: to.name,
      customer: { name: c.name, brief: c.brief },
      dailySummaries: summaries.reverse().map((s) => ({ day: s.day, summary: s.summary.en })),
      channels: chans.map((ch) => ({
        id: short.get(ch.id)!,
        title: ch.title,
        chatType: ch.chatType ?? "customer",
      })),
      tasks: openTasks.map((t) => ({
        title: t.title.en,
        status: t.status,
        kind: t.kind,
        deadlineAt: t.deadlineAt,
        channelId: t.channelId ? (short.get(t.channelId) ?? null) : null,
        ref: t.ref,
      })),
      messages: msgs,
    };
    const out = await generateStructured(
      HandoffOut,
      { instructions: HANDOFF_INSTRUCTIONS, prompt: renderHandoffPrompt(input) },
      {
        model: "main",
        task: "handoff",
        mockInput: input,
        log: { db, companyId, customerId: c.id },
      },
    );
    for (const ch of chans) {
      const b = out?.channels.find((x) => x.channel_id === short.get(ch.id));
      const chTasks = openTasks.filter(
        (t) => t.channelId === ch.id || (!t.channelId && ch.chatType === "customer"),
      );
      briefs.push({
        channelId: ch.id,
        channelTitle: ch.title,
        chatType: ch.chatType ?? "customer",
        customerId: c.id,
        customerName: c.name,
        whatHappened: b?.what_happened ?? { en: "—", ru: "—" },
        openTasks: chTasks.map((t) => ({
          taskId: t.id,
          title: t.title,
          status: t.status,
          deadlineAt: t.deadlineAt?.toISOString() ?? null,
        })),
        promisesMade: b?.promises_made ?? { en: "—", ru: "—" },
        risks: b?.risks ?? { en: "—", ru: "—" },
        nextSteps: b?.next_steps ?? { en: "—", ru: "—" },
      });
    }
  }
  const [row] = await db
    .insert(handoffs)
    .values({ companyId, fromUserId, toUserId, briefs, status: "draft" })
    .returning({ id: handoffs.id });
  return row!.id;
}

/** Confirm: reassign the leaving dispatcher's customers and open tasks to the replacement. */
export async function confirmHandoff(
  db: Db,
  companyId: string,
  handoffId: string,
): Promise<number | null> {
  const [h] = await db
    .select()
    .from(handoffs)
    .where(and(eq(handoffs.id, handoffId), eq(handoffs.companyId, companyId)));
  if (!h || h.status !== "draft" || !h.fromUserId || !h.toUserId) return null;
  const moved = await db
    .update(customers)
    .set({ assignedUserId: h.toUserId })
    .where(and(eq(customers.companyId, companyId), eq(customers.assignedUserId, h.fromUserId)))
    .returning({ id: customers.id });
  if (moved.length) {
    await db
      .update(tasks)
      .set({ assigneeUserId: h.toUserId })
      .where(
        and(
          eq(tasks.companyId, companyId),
          inArray(
            tasks.customerId,
            moved.map((m) => m.id),
          ),
          notInArray(tasks.status, ["delivered", "cancelled"]),
        ),
      );
  }
  await db
    .update(handoffs)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(handoffs.id, h.id));
  return moved.length;
}
