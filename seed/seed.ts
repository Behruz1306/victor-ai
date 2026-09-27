// pnpm seed        → (re)creates the demo company and inserts "yesterday" raw messages,
//                    then enqueues analysis (the worker runs the pipeline).
// pnpm seed:reset  → wipes the demo company.
// pnpm seed --analyze → also runs the pipeline inline (no worker needed).
// seed --if-empty    → only when the database has no company yet (Docker first start).
import { getDb, closeDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { seedDemo, resetDemo, DEMO_PASSWORD, demoData } from "@/lib/demo/seed";

async function main() {
  const db = getDb();
  if (process.argv.includes("--reset")) {
    await resetDemo(db);
    console.log("[seed] demo company removed");
    return;
  }
  if (process.argv.includes("--if-empty")) {
    const [any] = await db.select({ id: companies.id }).from(companies).limit(1);
    if (any) {
      console.log("[seed] database already has data — skipping demo seed");
      return;
    }
  }
  const { companyId, messages } = await seedDemo(db);
  console.log(
    `[seed] ${demoData.company.name}: ${messages} raw messages inserted (company ${companyId})`,
  );
  if (process.argv.includes("--analyze")) {
    const { drainJobs } = await import("@/worker/runner");
    const n = await drainJobs(db);
    console.log(`[seed] pipeline ran inline: ${n} jobs processed`);
  } else {
    console.log("[seed] analysis jobs queued — the worker processes them (pnpm dev or the worker container)");
  }
  console.log(`[seed] demo logins (password ${DEMO_PASSWORD}):`);
  for (const u of demoData.users) console.log(`   ${u.role.padEnd(10)} ${u.email}`);
}

main()
  .then(() => closeDb())
  .catch(async (err: unknown) => {
    console.error("[seed] failed", err);
    await closeDb();
    process.exit(1);
  });
