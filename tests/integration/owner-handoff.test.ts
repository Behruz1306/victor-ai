import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { customers, handoffs, tasks, users } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { ownerKpis, ownerDigest, avgAckMinutes } from "@/lib/queries/owner";
import { leadOverview } from "@/lib/queries/lead";
import { createHandoff, confirmHandoff } from "@/lib/pipeline/handoff";
import { resetDatabase } from "./helpers";

const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();
let companyId = "";

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const all = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) await analyzeCustomer(db, companyId, c.id, NOW);
});

describe("owner screen data", () => {
  it("KPIs count open and at-risk tasks; ack time is averaged over real pairs", async () => {
    const k = await ownerKpis(db, companyId, NOW);
    const open = await db.select().from(tasks).where(eq(tasks.companyId, companyId));
    expect(k.openTasks).toBe(
      open.filter((t) => t.status !== "delivered" && t.status !== "cancelled").length,
    );
    expect(k.atRisk).toBeGreaterThan(0);
    expect(k.atRisk).toBeLessThanOrEqual(k.openTasks);
    expect(
      avgAckMinutes([
        { receivedAt: new Date(0), ackAt: new Date(10 * 60000) },
        { receivedAt: new Date(0), ackAt: null },
      ]),
    ).toEqual({
      minutes: 10,
      count: 1,
    });
  });

  it("digest shows at most 5 open items, complaint among them", async () => {
    const d = await ownerDigest(db, companyId);
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.items.length).toBeLessThanOrEqual(5);
    expect(d.items.map((i) => i.kind)).toContain("complaint");
    for (const i of d.items) expect(i.title.en && i.title.ru).toBeTruthy();
  });

  it("lead table flags Timur as the dispatcher with problems", async () => {
    const rows = await leadOverview(db, companyId);
    const timur = rows.find((r) => r.name === "Timur")!;
    const aziz = rows.find((r) => r.name === "Aziz")!;
    expect(timur.openUrgent).toBeGreaterThan(aziz.openUrgent);
    expect(timur.toneFlags).toBeGreaterThanOrEqual(1);
  });
});

describe("handoff brief", () => {
  it("builds a brief per chat and reassigns customers on confirm", async () => {
    const [timur] = await db.select().from(users).where(eq(users.email, "timur@demo.victor.ai"));
    const [aziz] = await db.select().from(users).where(eq(users.email, "aziz@demo.victor.ai"));
    const id = await createHandoff(db, companyId, timur!.id, aziz!.id, NOW);
    const [h] = await db.select().from(handoffs).where(eq(handoffs.id, id));
    expect(h!.status).toBe("draft");
    expect(h!.briefs.map((b) => b.customerName)).toContain("Apex Logistics");
    const apexCust = h!.briefs.find(
      (b) => b.customerName === "Apex Logistics" && b.chatType === "customer",
    )!;
    expect(apexCust.openTasks.length).toBeGreaterThan(0);
    expect(apexCust.nextSteps.en.length).toBeGreaterThan(0);

    expect(await confirmHandoff(db, companyId, id)).toBe(2);
    const mine = await db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.assignedUserId, aziz!.id)));
    expect(mine.map((c) => c.name).sort()).toEqual([
      "Apex Logistics",
      "Great Lakes Foods",
      "Summit Brokerage",
    ]);
    expect(await confirmHandoff(db, companyId, id)).toBeNull();
  });
});
