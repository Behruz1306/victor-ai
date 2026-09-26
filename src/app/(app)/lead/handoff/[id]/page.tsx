import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requirePage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { companies, handoffs, users } from "@/lib/db/schema";
import { HandoffView } from "./handoff-view";

export const metadata = { title: "Handoff brief" };

export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("manage:handoff");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [h] = await db
    .select()
    .from(handoffs)
    .where(and(eq(handoffs.id, id), eq(handoffs.companyId, ctx.companyId)));
  if (!h) notFound();
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [h.fromUserId, h.toUserId].filter(Boolean) as string[]));
  const [company] = await db
    .select({ tz: companies.timezone, name: companies.name })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));
  return (
    <HandoffView
      data={JSON.parse(
        JSON.stringify({
          id: h.id,
          status: h.status,
          createdAt: h.createdAt,
          confirmedAt: h.confirmedAt,
          briefs: h.briefs,
          from: people.find((p) => p.id === h.fromUserId)?.name ?? "—",
          to: people.find((p) => p.id === h.toUserId)?.name ?? "—",
          timezone: company!.tz,
          companyName: company!.name,
        }),
      )}
    />
  );
}
