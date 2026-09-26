import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      db: "up",
      llm: env().llm.provider,
      latencyMs: Date.now() - started,
    });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
