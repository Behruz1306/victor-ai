import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, customers } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { ownerKpis } from "@/lib/queries/owner";
import { resetEnvCache } from "@/lib/env";
import { resetDatabase } from "./helpers";

// Known issue: once the seeded "yesterday" was older than 24 h, the owner KPI
// "avg acknowledgment time" went empty. Demo mode now uses the scenario window.
const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();
let companyId = "";

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const all = await db.select().from(customers).where(eq(customers.companyId, companyId));
  for (const c of all) await analyzeCustomer(db, companyId, c.id, NOW);
});

describe("owner KPI window", () => {
  it("demo company in DEMO_MODE: the whole scenario counts, even 2 days later", async () => {
    const later = new Date(NOW.getTime() + 48 * 3_600_000);
    const k = await ownerKpis(db, companyId, later);
    expect(k.window.kind).toBe("demoScenario");
    expect(k.avgAckMinutes).not.toBeNull();
    expect(k.ackSample).toBeGreaterThan(3);
  });

  it("a real company keeps the rolling 24 h window", async () => {
    await db.update(companies).set({ isDemo: false }).where(eq(companies.id, companyId));
    try {
      const later = new Date(NOW.getTime() + 48 * 3_600_000);
      const k = await ownerKpis(db, companyId, later);
      expect(k.window.kind).toBe("rolling24h");
      expect(k.avgAckMinutes).toBeNull();
    } finally {
      await db.update(companies).set({ isDemo: true }).where(eq(companies.id, companyId));
    }
  });

  it("outside DEMO_MODE even the demo company uses 24 h", async () => {
    process.env.DEMO_MODE = "false";
    resetEnvCache();
    try {
      const k = await ownerKpis(db, companyId, new Date(NOW.getTime() + 48 * 3_600_000));
      expect(k.window.kind).toBe("rolling24h");
    } finally {
      process.env.DEMO_MODE = "true";
      resetEnvCache();
    }
  });
});
