import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  customers,
  digests,
  messages,
  signals,
  suggestions,
  taskEvents,
  tasks,
  users,
} from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { runSla } from "@/lib/pipeline/sla-apply";
import { generateOwnerDigest } from "@/lib/pipeline/digest";
import { resetDatabase } from "./helpers";

// Saturday 10:00 CDT; the seed's "yesterday" is Friday.
const NOW = new Date("2026-09-26T15:00:00Z");

async function analyzeAll(companyId: string) {
  const db = getDb();
  const all = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) await analyzeCustomer(db, companyId, c.id, NOW);
  await runSla(db, companyId, NOW);
  return all;
}

describe("Apex scenario with the mock provider (raw messages → pipeline)", () => {
  const db = getDb();
  let companyId = "";
  let apexId = "";
  let glfId = "";

  beforeAll(async () => {
    await resetDatabase();
    ({ companyId } = await seedDemo(db, NOW));
    const all = await analyzeAll(companyId);
    apexId = all.find((c) => c.name === "Apex Logistics")!.id;
    glfId = all.find((c) => c.name === "Great Lakes Foods")!.id;
  });

  const taskByRef = async (ref: string) =>
    (
      await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.companyId, companyId), eq(tasks.ref, ref)))
    )[0]!;
  const openSignals = async (kind: string, customerId = apexId) =>
    db
      .select({ s: signals, text: messages.text })
      .from(signals)
      .leftJoin(messages, eq(messages.id, signals.evidenceMessageId))
      .where(
        and(
          eq(signals.companyId, companyId),
          eq(signals.customerId, customerId),
          eq(signals.status, "open"),
          eq(signals.kind, kind as "overdue"),
        ),
      );

  it("1. reefer 48230 is stuck at acknowledged with a missing-deadline signal", async () => {
    const t = await taskByRef("48230");
    expect(t.status).toBe("acknowledged");
    expect(t.stuckReason?.en).toMatch(/Acknowledged/);
    const s = await openSignals("missing_deadline");
    expect(s.some((x) => x.s.taskId === t.id)).toBe(true);
  });

  it("2. ETA for 48207 exists only in the Fleet chat → eta_not_forwarded", async () => {
    const t = await taskByRef("48207");
    expect(t.kind).toBe("eta_update");
    expect(t.status).not.toBe("delivered");
    const s = await openSignals("eta_not_forwarded");
    expect(s).toHaveLength(1);
    expect(s[0]!.s.taskId).toBe(t.id);
    expect(s[0]!.text).toMatch(/16:30/);
  });

  it("3. POD promised by 3pm for 48190 → overdue", async () => {
    const t = await taskByRef("48190");
    expect(t.status).toBe("deadline_set");
    expect(t.deadlineAt?.toISOString()).toBe("2026-09-25T20:00:00.000Z");
    const s = await openSignals("overdue");
    expect(s.some((x) => x.s.taskId === t.id)).toBe(true);
  });

  it("4. broker complaint is flagged", async () => {
    const s = await openSignals("complaint");
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toMatch(/third time we are chasing you/);
    expect(s[0]!.s.audience).toBe("owner");
  });

  it("5. rude reply is flagged and attributed to Timur", async () => {
    const s = await openSignals("rude_tone");
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toMatch(/Stop spamming/);
    const [timur] = await db.select().from(users).where(eq(users.email, "timur@demo.victor.ai"));
    expect(s[0]!.s.responsibleUserId).toBe(timur!.id);
  });

  it("6. load 48221 was handled perfectly end to end", async () => {
    const t = await taskByRef("48221");
    expect(t.status).toBe("delivered");
    const ev = await db
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, t.id))
      .orderBy(taskEvents.at);
    expect(ev.map((e) => e.toStatus)).toEqual([
      "received",
      "acknowledged",
      "in_progress",
      "deadline_set",
      "delivered",
    ]);
    expect(
      await openSignals("overdue").then((s) => s.filter((x) => x.s.taskId === t.id)),
    ).toHaveLength(0);
  });

  it("the suggestion to the broker carries the ETA that only existed in the Fleet chat", async () => {
    const [s] = await db
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.customerId, apexId),
          eq(suggestions.status, "pending"),
          eq(suggestions.intent, "apologize_and_fix"),
        ),
      );
    expect(s!.proposedText).toMatch(/48207/);
    expect(s!.proposedText).toMatch(/4:30 PM/);
    const used = await db
      .select({ text: messages.text })
      .from(messages)
      .where(eq(messages.id, s!.usedContext.messageIds[0]!));
    expect(used[0]!.text).toMatch(/трак 214/);
  });

  it("the clean customer produces no signals", async () => {
    const s = await db
      .select()
      .from(signals)
      .where(and(eq(signals.customerId, glfId), eq(signals.status, "open")));
    expect(s).toEqual([]);
  });

  it("owner digest never exceeds 5 items", async () => {
    const items = await generateOwnerDigest(db, companyId, NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    const [d] = await db.select().from(digests).where(eq(digests.companyId, companyId));
    expect(d!.items.length).toBe(items.length);
  });

  it("re-running analysis is idempotent (no duplicate tasks, signals or suggestions)", async () => {
    const before = {
      t: (await db.select().from(tasks).where(eq(tasks.companyId, companyId))).length,
      s: (
        await db
          .select()
          .from(signals)
          .where(and(eq(signals.companyId, companyId), eq(signals.status, "open")))
      ).length,
      p: (
        await db
          .select()
          .from(suggestions)
          .where(and(eq(suggestions.companyId, companyId), eq(suggestions.status, "pending")))
      ).length,
    };
    await analyzeAll(companyId);
    const after = {
      t: (await db.select().from(tasks).where(eq(tasks.companyId, companyId))).length,
      s: (
        await db
          .select()
          .from(signals)
          .where(and(eq(signals.companyId, companyId), eq(signals.status, "open")))
      ).length,
      p: (
        await db
          .select()
          .from(suggestions)
          .where(and(eq(suggestions.companyId, companyId), eq(suggestions.status, "pending")))
      ).length,
    };
    expect(after).toEqual(before);
  });
});
