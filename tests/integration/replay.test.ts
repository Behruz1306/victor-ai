import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, customers, suggestions, taskEvents, tasks } from "@/lib/db/schema";
import { seedDemo, ingestReplayMessage, replayMessages } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { resetDatabase } from "./helpers";

const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();
let companyId = "";
let apexId = "";

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const all = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) await analyzeCustomer(db, companyId, c.id, NOW);
  apexId = all.find((c) => c.name === "Apex Logistics")!.id;
  // Live replay: one message every 4 s, pipeline after each (as the worker would).
  for (let i = 0; i < replayMessages.length; i++) {
    const at = new Date(NOW.getTime() + (i + 1) * 4000);
    await ingestReplayMessage(db, companyId, i, at);
    for (const c of all) await analyzeCustomer(db, companyId, c.id, new Date(at.getTime() + 1000));
  }
});

const task = async (ref: string) =>
  (
    await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.ref, ref)))
  )[0]!;

describe("live replay", () => {
  it("creates the new requests without borrowing yesterday's messages as evidence", async () => {
    const reefer = await task("48244");
    expect(reefer.kind).toBe("quote");
    expect(reefer.status).toBe("received");
    const eta = await task("48215");
    expect(eta.kind).toBe("eta_update");
    const ev = await db.select().from(taskEvents).where(eq(taskEvents.taskId, eta.id));
    for (const e of ev) expect(e.at.getTime()).toBeGreaterThanOrEqual(eta.createdAt.getTime());
    expect((await task("S-5530")).kind).toBe("reschedule");
  });

  it("forwards the new fleet ETA to the broker and drops the stale internal reminder", async () => {
    const [cust] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.customerId, apexId), eq(channels.chatType, "customer")));
    const [s] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.channelId, cust!.id), eq(suggestions.status, "pending")));
    expect(s!.proposedText).toMatch(/48215/);
    expect(s!.proposedText).toMatch(/2:15 PM/);
    const [internal] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.customerId, apexId), eq(channels.chatType, "internal")));
    const pendingInternal = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.channelId, internal!.id), eq(suggestions.status, "pending")));
    expect(pendingInternal).toHaveLength(0); // Timur already asked fleet himself
  });
});
