// pnpm seed        → (re)creates the demo company and inserts "yesterday" raw messages,
//                    then enqueues analysis (the worker runs the pipeline).
// pnpm seed:reset  → wipes the demo company.
// pnpm seed --analyze → also runs the pipeline inline (no worker needed).
import { getDb, closeDb } from "@/lib/db/client";
import { seedDemo, resetDemo, DEMO_PASSWORD, demoData } from "@/lib/demo/seed";

async function main() {
  const db = getDb();
  if (process.argv.includes("--reset")) {
    await resetDemo(db);
    console.log("[seed] demo company removed");
    return;
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
    console.log("[seed] analysis jobs queued — start the worker (pnpm dev) to process them");
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
