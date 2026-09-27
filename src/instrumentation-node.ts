import { startInlineWorker } from "./worker/inline";

if (process.env.INLINE_WORKER === "true") {
  await startInlineWorker();
}
