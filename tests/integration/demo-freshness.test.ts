import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, messages } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { refreshStaleDemo } from "@/lib/demo/control";
import { resetDatabase } from "./helpers";

// On worker start in DEMO_MODE a scenario loaded more than 12 h ago is re-seeded relative to now.
const db = getDb();
let companyId = "";

beforeAll(async () => {
  await resetDatabase();
  ({ companyId } = await seedDemo(db, new Date()));
});

describe("demo freshness", () => {
  it("leaves a fresh scenario alone", async () => {
    const r = await refreshStaleDemo(db);
    expect(r.action).toBe("none");
    expect(r.ageHours).toBeLessThan(1);
  });

  it("re-seeds a scenario loaded 13 h ago so yesterday is yesterday again", async () => {
    // Pretend the demo was loaded 13 h ago (and its messages are 13 h older).
    await db.execute(sql`update messages set created_at = created_at - interval '13 hours',
      sent_at = sent_at - interval '13 hours' where company_id = ${companyId}`);
    const before = await db.select({ at: sql<string>`max(${messages.sentAt})` }).from(messages).where(eq(messages.companyId, companyId));
    const r = await refreshStaleDemo(db);
    expect(r.action).toBe("reseeded");
    expect(r.ageHours).toBeGreaterThan(12);
    const after = await db.select({ at: sql<string>`max(${messages.sentAt})` }).from(messages).where(eq(messages.companyId, companyId));
    expect(new Date(after[0]!.at).getTime() - new Date(before[0]!.at).getTime()).toBeGreaterThan(12 * 3_600_000 - 60_000);
    const queued = await db.select().from(jobs).where(eq(jobs.companyId, companyId));
    expect(queued.some((j) => j.type === "analyze_customer" && j.status === "pending")).toBe(true);
    expect((await refreshStaleDemo(db)).action).toBe("none");
  });
});
