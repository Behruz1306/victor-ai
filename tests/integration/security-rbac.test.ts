import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { sealData } from "iron-session";
import { getDb } from "@/lib/db/client";
import {
  channels,
  companies,
  customers,
  messages,
  playbookRules,
  tasks,
  users,
} from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { ingestMessage } from "@/lib/ingest/ingest";
import { sessionOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { DEFAULT_SLA, DEFAULT_CONSENT_TEXT } from "@/lib/types";
import { resetDatabase } from "./helpers";

// Route handlers read the session through next/headers → feed them a real sealed cookie.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
  }),
}));

const { GET: ownerGET } = await import("@/app/api/owner/route");
const { GET: leadGET } = await import("@/app/api/lead/route");
const { GET: dispatcherGET } = await import("@/app/api/dispatcher/route");
const { GET: customerGET } = await import("@/app/api/dispatcher/customers/[id]/route");
const { GET: messagesGET } = await import("@/app/api/channels/[id]/messages/route");
const { GET: playbookGET } = await import("@/app/api/playbook/route");
const { POST: approvePOST } = await import("@/app/api/suggestions/[id]/approve/route");
const { POST: settingsPOST } = await import("@/app/api/settings/route");

const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();
const BASE = "http://localhost:3000";
const ORIGIN = { origin: BASE, host: "localhost:3000" };

let A = { companyId: "", owner: "", timur: "", aziz: "", summit: "", apex: "" };
let B = { companyId: "", owner: "", customer: "", channel: "" };

async function loginAs(userId: string | null) {
  jar.clear();
  if (!userId) return;
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  jar.set(
    SESSION_COOKIE,
    await sealData(
      { userId: u!.id, companyId: u!.companyId, role: u!.role },
      { password: sessionOptions().password },
    ),
  );
}

const get = (url: string) => new Request(`${BASE}${url}`, { headers: ORIGIN });
const post = (url: string, body: unknown, headers: Record<string, string> = ORIGIN) =>
  new Request(`${BASE}${url}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = <T>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(async () => {
  await resetDatabase();
  const { companyId } = await seedDemo(db, NOW);
  const cs = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of cs) await analyzeCustomer(db, companyId, c.id, NOW);
  const us = await db.select().from(users).where(eq(users.companyId, companyId));
  A = {
    companyId,
    owner: us.find((u) => u.role === "owner")!.id,
    timur: us.find((u) => u.email === "timur@demo.pulse")!.id,
    aziz: us.find((u) => u.email === "aziz@demo.pulse")!.id,
    summit: cs.find((c) => c.name === "Summit Brokerage")!.id,
    apex: cs.find((c) => c.name === "Apex Logistics")!.id,
  };

  // A second, unrelated tenant.
  const [co] = await db
    .insert(companies)
    .values({
      name: "Other Carrier Inc",
      sla: DEFAULT_SLA,
      settings: {
        sendMode: "copy",
        retentionDays: 90,
        consentText: DEFAULT_CONSENT_TEXT,
        onboardingDone: true,
        signWithName: true,
      },
    })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({
      companyId: co!.id,
      name: "Other Owner",
      email: "owner@other.test",
      passwordHash: "x",
      role: "owner",
    })
    .returning();
  const [cust] = await db
    .insert(customers)
    .values({ companyId: co!.id, name: "Secret Broker" })
    .returning();
  await ingestMessage(db, co!.id, {
    source: "demo",
    channelExternalId: "secret-chat",
    channelTitle: "Secret chat",
    messageExternalId: "s1",
    senderExternalId: "x",
    senderName: "X",
    text: "TOP SECRET rate $9,999",
    sentAt: NOW,
  });
  const [ch] = await db.select().from(channels).where(eq(channels.companyId, co!.id));
  await db
    .update(channels)
    .set({ chatType: "customer", customerId: cust!.id })
    .where(eq(channels.id, ch!.id));
  await db
    .insert(playbookRules)
    .values({
      companyId: co!.id,
      scope: "company",
      ruleText: "OTHER TENANT RULE",
      status: "active",
    });
  B = { companyId: co!.id, owner: owner!.id, customer: cust!.id, channel: ch!.id };
});

beforeEach(() => jar.clear());

describe("RBAC (server-side guard on every handler)", () => {
  it("rejects anonymous requests", async () => {
    expect((await ownerGET(get("/api/owner"), params({}))).status).toBe(401);
    expect((await dispatcherGET(get("/api/dispatcher"), params({}))).status).toBe(401);
  });

  it("dispatcher cannot open owner/lead screens or change settings", async () => {
    await loginAs(A.timur);
    expect((await ownerGET(get("/api/owner"), params({}))).status).toBe(403);
    expect((await leadGET(get("/api/lead"), params({}))).status).toBe(403);
    expect(
      (await settingsPOST(post("/api/settings", { sla: { ackMinutes: 1 } }), params({}))).status,
    ).toBe(403);
    expect((await dispatcherGET(get("/api/dispatcher"), params({}))).status).toBe(200);
  });

  it("dispatcher sees only their own customers", async () => {
    await loginAs(A.timur);
    const res = await dispatcherGET(get("/api/dispatcher"), params({}));
    const body = (await res.json()) as { customers: { name: string }[] };
    expect(body.customers.map((c) => c.name).sort()).toEqual([
      "Apex Logistics",
      "Great Lakes Foods",
    ]);
    expect(
      (await customerGET(get(`/api/dispatcher/customers/${A.summit}`), params({ id: A.summit })))
        .status,
    ).toBe(404);
    expect(
      (await customerGET(get(`/api/dispatcher/customers/${A.apex}`), params({ id: A.apex })))
        .status,
    ).toBe(200);
  });

  it("lead can open the lead screen but not owner settings", async () => {
    const [lead] = await db.select().from(users).where(eq(users.email, "lead@demo.pulse"));
    await loginAs(lead!.id);
    expect((await leadGET(get("/api/lead"), params({}))).status).toBe(200);
    expect(
      (await settingsPOST(post("/api/settings", { sla: { ackMinutes: 1 } }), params({}))).status,
    ).toBe(403);
  });

  it("mutations from a foreign origin are rejected (CSRF)", async () => {
    await loginAs(A.timur);
    const res = await approvePOST(
      post(
        "/api/suggestions/00000000-0000-0000-0000-000000000000/approve",
        {},
        { origin: "http://evil.test", host: "localhost:3000" },
      ),
      params({ id: "00000000-0000-0000-0000-000000000000" }),
    );
    expect(res.status).toBe(403);
  });

  it("a deactivated user loses access immediately", async () => {
    await loginAs(A.aziz);
    await db.update(users).set({ active: false }).where(eq(users.id, A.aziz));
    expect((await dispatcherGET(get("/api/dispatcher"), params({}))).status).toBe(401);
    await db.update(users).set({ active: true }).where(eq(users.id, A.aziz));
  });
});

describe("tenant isolation: company A never sees company B", () => {
  it("owner of A cannot open B's customer, channel messages or rules", async () => {
    await loginAs(A.owner);
    expect(
      (
        await customerGET(
          get(`/api/dispatcher/customers/${B.customer}`),
          params({ id: B.customer }),
        )
      ).status,
    ).toBe(404);
    const msgs = (await (
      await messagesGET(get(`/api/channels/${B.channel}/messages`), params({ id: B.channel }))
    ).json()) as { messages: unknown[] };
    expect(msgs.messages).toEqual([]);
    const pb = JSON.stringify(await (await playbookGET(get("/api/playbook"), params({}))).json());
    expect(pb).not.toContain("OTHER TENANT RULE");
    const disp = JSON.stringify(
      await (await dispatcherGET(get("/api/dispatcher"), params({}))).json(),
    );
    expect(disp).not.toContain("Secret Broker");
  });

  it("owner of B sees nothing of A", async () => {
    await loginAs(B.owner);
    const disp = JSON.stringify(
      await (await dispatcherGET(get("/api/dispatcher"), params({}))).json(),
    );
    expect(disp).not.toContain("Apex");
    const owner = JSON.stringify(await (await ownerGET(get("/api/owner"), params({}))).json());
    expect(owner).not.toContain("Apex");
    expect(owner).not.toContain("48230");
    const [aTask] = await db.select().from(tasks).where(eq(tasks.companyId, A.companyId)).limit(1);
    expect(
      (
        await customerGET(
          get(`/api/dispatcher/customers/${aTask!.customerId}`),
          params({ id: aTask!.customerId }),
        )
      ).status,
    ).toBe(404);
    const [aChan] = await db
      .select()
      .from(messages)
      .where(eq(messages.companyId, A.companyId))
      .limit(1);
    const m = (await (
      await messagesGET(
        get(`/api/channels/${aChan!.channelId}/messages`),
        params({ id: aChan!.channelId }),
      )
    ).json()) as { messages: unknown[] };
    expect(m.messages).toEqual([]);
  });
});
