// Worker process: Telegram long polling, job runner, scheduler (SLA loop, retention, heartbeat).
// Single-service hosts run the same engine inside the web process instead (INLINE_WORKER=true).
import { getDb, closeDb } from "@/lib/db/client";
import { startEngine } from "./engine";

async function main() {
  const engine = await startEngine(getDb(), { inline: false });
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} — shutting down`);
    await engine.stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

main().catch(async (err: unknown) => {
  console.error("[worker] fatal", err);
  await closeDb();
  process.exit(1);
});
