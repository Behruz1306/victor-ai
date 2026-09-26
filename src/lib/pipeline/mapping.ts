import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, customers, messages, participants } from "@/lib/db/schema";
import { generateStructured } from "@/lib/llm";
import { ChannelMapping } from "@/lib/llm/schemas";
import { MAPPING_INSTRUCTIONS, renderMappingPrompt } from "@/lib/llm/prompts/other";

/** AI proposal for an unmapped chat: which customer and chat type (owner confirms in Sources). */
export async function proposeMapping(db: Db, companyId: string, channelId: string): Promise<void> {
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.companyId, companyId)));
  if (!ch || ch.chatType) return;
  const first = await db
    .select({ text: messages.text, sender: participants.displayName })
    .from(messages)
    .leftJoin(participants, eq(participants.id, messages.participantId))
    .where(eq(messages.channelId, channelId))
    .orderBy(asc(messages.sentAt))
    .limit(5);
  const custs = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  const input = {
    title: ch.title,
    firstMessages: first.map((m) => ({ sender: m.sender ?? "?", text: m.text })),
    customers: custs,
  };
  const out = await generateStructured(
    ChannelMapping,
    { instructions: MAPPING_INSTRUCTIONS, prompt: renderMappingPrompt(input) },
    { model: "fast", task: "map_channel", mockInput: input, log: { db, companyId, channelId } },
  );
  if (!out) return;
  const known = custs.find((c) => c.id === out.customer_id);
  await db
    .update(channels)
    .set({
      mappingProposal: {
        customerId: known?.id ?? null,
        customerName: known?.name ?? out.new_customer_name,
        chatType: out.chat_type,
        confidence: Math.max(0, Math.min(1, out.confidence)),
        reason: out.reason.slice(0, 300),
      },
    })
    .where(eq(channels.id, channelId));
}
