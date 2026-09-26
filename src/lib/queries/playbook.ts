import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, companies, customers, playbookRules, suggestions, users } from "@/lib/db/schema";
import { editRate, editRateBy, editRateDaily } from "./metrics";

export async function playbookData(db: Db, companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const rules = await db
    .select({ r: playbookRules, customerName: customers.name })
    .from(playbookRules)
    .leftJoin(customers, eq(customers.id, playbookRules.customerId))
    .where(eq(playbookRules.companyId, companyId))
    .orderBy(desc(playbookRules.updatedAt));
  const exampleIds = [...new Set(rules.flatMap((r) => r.r.examples))];
  const examples = exampleIds.length
    ? await db
        .select({ s: suggestions, channelTitle: channels.title, decidedBy: users.name })
        .from(suggestions)
        .innerJoin(channels, eq(channels.id, suggestions.channelId))
        .leftJoin(users, eq(users.id, suggestions.decidedBy))
        .where(and(eq(suggestions.companyId, companyId), inArray(suggestions.id, exampleIds)))
    : [];
  const byId = new Map(examples.map((e) => [e.s.id, e]));

  const custs = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  const staff = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.companyId, companyId));
  const byCustomer = await editRateBy(db, companyId, "customer_id");
  const byUser = await editRateBy(db, companyId, "decided_by");

  return {
    rules: rules.map(({ r, customerName }) => ({
      id: r.id,
      scope: r.scope,
      customerName,
      chatType: r.chatType,
      text: r.ruleText,
      status: r.status,
      hits: r.hits,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      sources: r.examples
        .map((id) => byId.get(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => ({
          id: e.s.id,
          proposed: e.s.proposedText,
          final: e.s.finalText,
          reason: e.s.editReason,
          channelTitle: e.channelTitle,
          decidedBy: e.decidedBy,
          decidedAt: e.s.decidedAt,
        })),
    })),
    editRate: {
      overall: await editRate(db, companyId),
      daily: await editRateDaily(db, companyId, company?.timezone ?? "America/Chicago", 14),
      byCustomer: custs
        .map((c) => ({
          id: c.id,
          name: c.name,
          ...(byCustomer.get(c.id) ?? { approved: 0, edited: 0, rate: null }),
        }))
        .filter((r) => r.approved + r.edited > 0),
      byDispatcher: staff
        .map((u) => ({
          id: u.id,
          name: u.name,
          ...(byUser.get(u.id) ?? { approved: 0, edited: 0, rate: null }),
        }))
        .filter((r) => r.approved + r.edited > 0),
    },
  };
}
