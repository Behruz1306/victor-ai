// Runs once when the Next.js server starts. With INLINE_WORKER=true the worker (queue, SLA
// scheduler, Telegram long poll) runs inside the web process — one service to deploy.
export async function register() {
  // The edge build replaces NEXT_RUNTIME with "edge" and drops this branch entirely.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
