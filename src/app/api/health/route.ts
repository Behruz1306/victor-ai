import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { providerChain } from "@/lib/llm/providers";
import { inlineState } from "@/worker/inline";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const inline = inlineState();
  try {
    const rows = await getDb().execute<{ at: Date | null }>(
      sql`select (select updated_at from system_state where key = 'worker_heartbeat') as at`,
    );
    const hb = rows[0]?.at ? new Date(rows[0].at) : null;
    return NextResponse.json({
      ok: !inline?.error,
      db: "up",
      llm: providerChain()[0]!.id,
      worker: {
        mode: inline ? "inline" : "separate",
        ready: inline ? inline.ready : null,
        error: inline?.error ?? null,
        alive: hb ? Date.now() - hb.getTime() < 90_000 : false,
      },
      latencyMs: Date.now() - started,
    }, { status: inline?.error ? 503 : 200 });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
