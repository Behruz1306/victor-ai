import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { customers, messageLinks, signals, tasks } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { ingestMessage } from "@/lib/ingest/ingest";
import { runSla } from "@/lib/pipeline/sla-apply";
import { resetDatabase } from "./helpers";

// Known issue from the first build: any team message cleared "reply needed" for the whole chat,
// even when the customer's earlier question (about another load) was still unanswered.
const NOW = new Date("2026-09-26T15:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const db = getDb();
let companyId = "";
let apexId = "";

const openReplyNeeded = () =>
  db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.companyId, companyId),
        eq(signals.customerId, apexId),
        eq(signals.kind, "reply_needed"),
        eq(signals.status, "open"),
      ),
    );
const taskByRef = async (ref: string) =>
  (
    await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.ref, ref)))
  )[0]!;

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const [apex] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.name, "Apex Logistics")));
  apexId = apex!.id;
  await analyzeCustomer(db, companyId, apexId, NOW);
});

describe("reply_needed per customer question, per task", () => {
  it("the analysis links questions and replies to tasks", async () => {
    const t30 = await taskByRef("48230");
    const links = await db.select().from(messageLinks).where(eq(messageLinks.taskId, t30.id));
    // Mike's request, Timur's "ok" and Mike's "any news on the reefer 48230?"
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("Mike's unanswered follow-up about 48230 opens reply_needed on that task", async () => {
    const t30 = await taskByRef("48230");
    const open = await openReplyNeeded();
    expect(open.map((s) => s.taskId)).toContain(t30.id);
  });

  it("a team reply about another load (POD 48190) does not clear it", async () => {
    await ingestMessage(db, companyId, {
      source: "demo",
      channelExternalId: "apex-cust",
      channelTitle: "Apex ↔ Blue Ridge",
      messageExternalId: "test-pod-reply",
      senderExternalId: "timur",
      senderName: "Timur",
      text: "Mike, here is the POD for 48190 (attached: POD_48190.pdf).",
      sentAt: at(2),
    });
    await analyzeCustomer(db, companyId, apexId, at(3));
    await runSla(db, companyId, at(3));

    expect((await taskByRef("48190")).status).toBe("delivered");
    const t30 = await taskByRef("48230");
    const still = (await openReplyNeeded()).find((s) => s.taskId === t30.id);
    expect(still).toBeDefined();
    expect(still!.reason.en).toMatch(/not about this/);
  });

  it("a reply about 48230 finally clears it", async () => {
    await ingestMessage(db, companyId, {
      source: "demo",
      channelExternalId: "apex-cust",
      channelTitle: "Apex ↔ Blue Ridge",
      messageExternalId: "test-48230-reply",
      senderExternalId: "timur",
      senderName: "Timur",
      text: "Mike, sorry for the wait on 48230 — checking the reefer now, will confirm by 5:30 PM.",
      sentAt: at(4),
    });
    await analyzeCustomer(db, companyId, apexId, at(5));
    await runSla(db, companyId, at(5));
    const t30 = await taskByRef("48230");
    expect((await openReplyNeeded()).find((s) => s.taskId === t30.id)).toBeUndefined();
  });
});
