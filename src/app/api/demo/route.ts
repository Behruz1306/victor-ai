import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, customers } from "@/lib/db/schema";
import { guardApi, handle, HttpError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { loadYesterday } from "@/lib/demo/seed";
import { demoStatus, resetDemoData, startReplay } from "@/lib/demo/control";
import { cancelPending, enqueue } from "@/lib/jobs/queue";
import { runSla } from "@/lib/pipeline/sla-apply";
import { generateOwnerDigest } from "@/lib/pipeline/digest";
import { systemStatus } from "@/lib/queries/settings";
import { providerInfo } from "@/lib/llm";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function demoCtx(req: Request) {
  if (!env().demoMode) throw new HttpError(404, "not found");
  const ctx = await guardApi(req, "manage:demo");
  const [company] = await getDb().select().from(companies).where(eq(companies.id, ctx.companyId));
  if (!company?.isDemo) throw new HttpError(403, "demo controls only work on the demo company");
  return ctx;
}

export const GET = handle(async (req) => {
  const ctx = await demoCtx(req);
  const db = getDb();
  return NextResponse.json({
    ...(await demoStatus(db, ctx.companyId)),
    system: await systemStatus(db),
    llm: await providerInfo(),
  });
});

const Body = z.object({ action: z.enum(["reset", "load", "replay_start", "replay_stop", "sla", "digest"]) });

export const POST = handle(async (req) => {
  const ctx = await demoCtx(req);
  const { action } = Body.parse(await req.json());
  const db = getDb();
  let result: Record<string, unknown> = {};
  if (action === "reset") {
    await resetDemoData(db, ctx.companyId);
    await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "demo_reset" });
  } else if (action === "load") {
    const inserted = await loadYesterday(db, ctx.companyId);
    // If the worker is not running, run the pipeline here so the demo never stalls.
    if (!(await systemStatus(db)).workerAlive) {
      const { drainJobs } = await import("@/worker/runner");
      result.processedInline = await drainJobs(db);
    } else {
      // Make sure every customer is analyzed even when all messages already existed.
      const all = await db.select({ id: customers.id }).from(customers).where(eq(customers.companyId, ctx.companyId));
      for (const c of all) {
        await enqueue(db, {
          type: "analyze_customer",
          companyId: ctx.companyId,
          payload: { companyId: ctx.companyId, customerId: c.id },
          dedupeKey: `analyze:${c.id}`,
          debounceMs: 500,
        });
      }
    }
    result.inserted = inserted;
    await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "demo_loaded", meta: { inserted } });
  } else if (action === "replay_start") {
    result.scheduled = await startReplay(db, ctx.companyId);
    await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "demo_replay", meta: { started: true } });
  } else if (action === "replay_stop") {
    result.cancelled = await cancelPending(db, "replay_message", ctx.companyId);
    await audit({ companyId: ctx.companyId, userId: ctx.userId, action: "demo_replay", meta: { stopped: true } });
  } else if (action === "sla") {
    result = await runSla(db, ctx.companyId);
  } else if (action === "digest") {
    result.items = (await generateOwnerDigest(db, ctx.companyId)).length;
  }
  return NextResponse.json({ ok: true, ...result });
});
