import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { dbLoginLimiter } from "@/lib/auth/rate-limit";
import { resetDatabase } from "./helpers";

// Login attempts live in Postgres: every web instance (and a restarted one) sees the same count.
const db = getDb();

beforeAll(async () => {
  await resetDatabase();
});

describe("login rate limit in Postgres", () => {
  it("allows 5 attempts per window, blocks the 6th, and the count is shared across limiters", async () => {
    const a = dbLoginLimiter(db, 5, 60_000);
    const b = dbLoginLimiter(db, 5, 60_000); // "another web instance"
    for (let i = 0; i < 3; i++) expect(await a.hit("1.2.3.4|owner@demo.victor.ai")).toBe(true);
    for (let i = 0; i < 2; i++) expect(await b.hit("1.2.3.4|owner@demo.victor.ai")).toBe(true);
    expect(await a.hit("1.2.3.4|owner@demo.victor.ai")).toBe(false);
    // other keys are independent
    expect(await a.hit("1.2.3.4|lead@demo.victor.ai")).toBe(true);
  });

  it("a successful login resets the key; the window expires on its own", async () => {
    const l = dbLoginLimiter(db, 2, 1_000);
    await l.hit("k");
    await l.hit("k");
    expect(await l.hit("k")).toBe(false);
    await l.reset("k");
    expect(await l.hit("k")).toBe(true);
    await l.hit("k");
    expect(await l.hit("k")).toBe(false);
    await new Promise((r) => setTimeout(r, 1_100));
    expect(await l.hit("k")).toBe(true);
  });
});
