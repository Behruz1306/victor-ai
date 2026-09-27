import { and, asc, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { companies, users } from "@/lib/db/schema";
import { providerInfo } from "@/lib/llm";
import { DispatcherView } from "./dispatcher-view";

export const metadata = { title: "Dispatcher" };

export default async function DispatcherPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; ch?: string }>;
}) {
  const ctx = await requirePage("view:dispatcher");
  const sp = await searchParams;
  const [company] = await getDb()
    .select({ tz: companies.timezone })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));
  const info = await providerInfo();
  const uuid = /^[0-9a-f-]{36}$/i;
  const dispatchers =
    ctx.role === "dispatcher"
      ? []
      : await getDb()
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(
            and(
              eq(users.companyId, ctx.companyId),
              eq(users.role, "dispatcher"),
              eq(users.active, true),
            ),
          )
          .orderBy(asc(users.name));
  return (
    <DispatcherView
      initialCustomer={sp.c && uuid.test(sp.c) ? sp.c : null}
      initialChannel={sp.ch && uuid.test(sp.ch) ? sp.ch : null}
      dispatchers={dispatchers}
      canViewOthers={ctx.role !== "dispatcher"}
      provider={info.offline ? "mock" : info.label}
      timezone={company?.tz ?? "America/Chicago"}
    />
  );
}
