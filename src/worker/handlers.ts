import type { JobType } from "@/lib/jobs/queue";
import type { JobHandler } from "./runner";
import { ingestReplayMessage } from "@/lib/demo/seed";

export const handlers: Partial<Record<JobType, JobHandler>> = {
  replay_message: async (db, payload) => {
    await ingestReplayMessage(db, String(payload.companyId), Number(payload.index));
  },
};
