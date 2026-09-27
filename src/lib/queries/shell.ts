import { and, count, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, tasks, users } from "@/lib/db/schema";
import type { Ctx } from "@/lib/auth/guard";
import { navFor } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { getLlmMode } from "@/lib/llm/mode";
import { providerChain } from "@/lib/llm/providers";
import { systemStatus } from "./settings";
import { visibleCustomers } from "./scope";

/** Live indicator in the shell: worker up, how many chats are read, bot, AI mode. */
export async function shellStatus(db: Db, companyId: string) {
  const [chats] = await db
    .select({ n: count() })
    .from(channels)
    .where(
      and(eq(channels.companyId, companyId), eq(channels.active, true), isNotNull(channels.chatType)),
    );
  const sys = await systemStatus(db);
  const offline = env().llm.forceMock || (await getLlmMode(db)) === "offline";
  const first = providerChain()[0]!;
  return {
    live: sys.workerAlive,
    sources: chats?.n ?? 0,
    bot: { configured: sys.telegram.configured, online: sys.telegram.online },
    ai: { offline: offline || first.kind === "mock", provider: offline ? "mock" : first.id },
  };
}

/** ⌘K index: customers, open tasks, dispatchers and screens the user may see. */
export async function searchIndex(db: Db, ctx: Ctx) {
  const custs = await visibleCustomers(db, ctx);
  const ids = custs.map((c) => c.id);
  const open = ids.length
    ? await db
        .select({ id: tasks.id, title: tasks.title, ref: tasks.ref, customerId: tasks.customerId, status: tasks.status })
        .from(tasks)
        .where(
          and(
            eq(tasks.companyId, ctx.companyId),
            inArray(tasks.customerId, ids),
            notInArray(tasks.status, ["delivered", "cancelled"]),
          ),
        )
        .limit(200)
    : [];
  const team =
    ctx.role === "dispatcher"
      ? []
      : await db
          .select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(and(eq(users.companyId, ctx.companyId), eq(users.active, true)));
  return {
    customers: custs.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    tasks: open.map((t) => ({
      id: t.id,
      title: t.title,
      ref: t.ref,
      status: t.status,
      customer: custs.find((c) => c.id === t.customerId)?.name ?? "",
    })),
    people: team.filter((u) => u.role === "dispatcher"),
    screens: navFor(ctx.role, env().demoMode).map((n) => ({ href: n.href, key: n.key })),
  };
}
