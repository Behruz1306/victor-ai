import type { JobType } from "@/lib/jobs/queue";
import type { JobHandler } from "./runner";
import { ingestReplayMessage } from "@/lib/demo/seed";
import { analyzeCustomer } from "@/lib/pipeline/analyze";
import { generateOwnerDigest } from "@/lib/pipeline/digest";
import { proposeMapping } from "@/lib/pipeline/mapping";
import { retentionCleanup } from "@/lib/pipeline/retention";
import { distillFromSuggestion } from "@/lib/pipeline/learning";
import { telegramSend, type TelegramSendPayload } from "@/lib/telegram/send";

const str = (v: unknown) => String(v ?? "");

export const handlers: Partial<Record<JobType, JobHandler>> = {
  analyze_customer: async (db, p) => {
    await analyzeCustomer(db, str(p.companyId), str(p.customerId));
  },
  owner_digest: async (db, p) => {
    await generateOwnerDigest(db, str(p.companyId));
  },
  map_proposal: async (db, _p, job) => {
    await proposeMapping(db, str(job.companyId), str(_p.channelId));
  },
  distill_rule: async (db, p) => {
    await distillFromSuggestion(db, str(p.companyId), str(p.suggestionId));
  },
  telegram_send: async (db, p) => {
    await telegramSend(db, p as unknown as TelegramSendPayload);
  },
  replay_message: async (db, p) => {
    await ingestReplayMessage(db, str(p.companyId), Number(p.index));
  },
  retention_cleanup: async (db) => {
    await retentionCleanup(db);
  },
};
