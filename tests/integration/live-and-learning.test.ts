import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  channels,
  customers,
  messages,
  playbookRules,
  signals,
  suggestions,
  tasks,
  users,
} from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { ingestMessage } from "@/lib/ingest/ingest";
import { normalizeTelegramGroup } from "@/lib/ingest/normalize";
import { editSuggestion } from "@/lib/pipeline/suggestion-actions";
import { dispatcherOverview } from "@/lib/queries/dispatcher";
import type { Ctx } from "@/lib/auth/guard";
import { resetDatabase } from "./helpers";

const NOW = new Date("2026-09-26T15:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const db = getDb();

let companyId = "";
let apexId = "";
let timur: Ctx;

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const all = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) await analyzeCustomer(db, companyId, c.id, NOW);
  apexId = all.find((c) => c.name === "Apex Logistics")!.id;
  const [u] = await db.select().from(users).where(eq(users.email, "timur@demo.pulse"));
  timur = { userId: u!.id, companyId, role: "dispatcher", name: u!.name, email: u!.email };
});

describe("golden path step 3: edit → learned rule → next suggestion follows it", () => {
  it("learns a customer rule from an edit with a reason and applies it next time", async () => {
    const [eta] = await db
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.customerId, apexId),
          eq(suggestions.status, "pending"),
          eq(suggestions.intent, "apologize_and_fix"),
        ),
      );
    expect(eta!.proposedText).toMatch(/around 4:30 PM/);
    const edited = eta!.proposedText
      .replace("around 4:30 PM", "4:30 PM CST")
      .replace("Load 48207 is", "Load 48207, truck #214 is");
    const res = await editSuggestion(
      db,
      timur,
      eta!.id,
      edited,
      "Apex wants ETA in CST and with the truck number",
    );

    expect(res.mode).toBe("recorded");
    expect(res.rule).toMatchObject({
      scope: "customer",
      status: "active",
      customerName: "Apex Logistics",
    });
    const [rule] = await db
      .select()
      .from(playbookRules)
      .where(eq(playbookRules.id, res.rule!.ruleId));
    expect(rule!.ruleText).toMatch(/CST/);
    expect(rule!.examples).toContain(eta!.id);

    // The edited text was recorded in the customer chat as sent by Timur.
    const [sent] = await db
      .select()
      .from(messages)
      .where(eq(messages.externalId, `pulse-${eta!.id}`));
    expect(sent!.text).toBe(edited);

    await analyzeCustomer(db, companyId, apexId, at(5));

    // The ETA reached the customer: task delivered, eta_not_forwarded resolved.
    const [etaTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.ref, "48207")));
    expect(etaTask!.status).toBe("delivered");
    const openEta = await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.companyId, companyId),
          eq(signals.kind, "eta_not_forwarded"),
          eq(signals.status, "open"),
        ),
      );
    expect(openEta).toHaveLength(0);

    // Next Apex suggestion to the customer chat follows the rule and says so.
    const [custChan] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.customerId, apexId), eq(channels.chatType, "customer")));
    const [next] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.channelId, custChan!.id), eq(suggestions.status, "pending")));
    expect(next!.proposedText).toMatch(/\bCST\b/);
    expect(next!.usedContext.ruleIds).toContain(rule!.id);
  });

  it("edit rate reflects the decision", async () => {
    const o = await dispatcherOverview(db, timur);
    expect(o.stats.editRate).toMatchObject({ approved: 0, edited: 1, rate: 1 });
  });
});

describe("golden path step 6: live Telegram message → task + suggestion", () => {
  it("a group message in a chat mapped to Apex produces a new task and a suggestion", async () => {
    const tg = (id: number, text: string, date: Date) =>
      normalizeTelegramGroup({
        message_id: id,
        date: Math.floor(date.getTime() / 1000),
        chat: { id: -1009876, type: "supergroup", title: "Apex live" },
        from: { id: 777, first_name: "Mike" },
        text,
      })!;
    await ingestMessage(db, companyId, tg(1, "hi team", at(6)));
    const [ch] = await db.select().from(channels).where(eq(channels.externalId, "-1009876"));
    await db
      .update(channels)
      .set({ chatType: "customer", customerId: apexId })
      .where(eq(channels.id, ch!.id));

    const r = await ingestMessage(
      db,
      companyId,
      tg(2, "Need a reefer PU tomorrow 7am Dallas → Atlanta, can you cover?", at(7)),
    );
    expect(r.analyzeCustomerIds).toEqual([apexId]);
    await analyzeCustomer(db, companyId, apexId, at(7.2));

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, companyId), eq(tasks.channelId, ch!.id)));
    expect(task!.kind).toBe("quote");
    expect(task!.title.en).toMatch(/Dallas → Atlanta/);
    expect(task!.status).toBe("received");

    const [s] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.channelId, ch!.id), eq(suggestions.status, "pending")));
    expect(s!.intent).toBe("confirm_task");
    expect(s!.proposedText).toMatch(/Dallas → Atlanta/);
    expect(s!.proposedText).toMatch(/7:00 AM CST/); // the learned Apex rule applies here too
  });
});
