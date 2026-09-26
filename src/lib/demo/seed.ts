import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { channels, companies, customers, participants, users } from "@/lib/db/schema";
import type { ChatType, Role } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { ingestMessage, DEMO_DEBOUNCE_MS } from "@/lib/ingest/ingest";
import { sideFor } from "@/lib/ingest/normalize";
import { atLocalTime } from "@/lib/time";
import { DEFAULT_SLA, DEFAULT_CONSENT_TEXT } from "@/lib/types";
import demo from "../../../seed/demo-company.json";
import replay from "../../../seed/live-replay.json";

export const DEMO_PASSWORD = "demo1234";

type SeedMessage = {
  key: string;
  day?: number;
  time?: string;
  channel: string;
  from: string;
  text: string;
  reply_to?: string;
};

export const demoData = demo;
export const replayMessages = replay.messages as SeedMessage[];

export async function findDemoCompanyId(db: Db): Promise<string | null> {
  const [c] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.isDemo, true))
    .limit(1);
  return c?.id ?? null;
}

export async function resetDemo(db: Db): Promise<void> {
  // Cascades to every tenant table.
  await db.delete(companies).where(eq(companies.isDemo, true));
}

/** Company, users, customers, channels and chat participants. No messages. */
export async function createDemoCompany(db: Db): Promise<string> {
  const [company] = await db
    .insert(companies)
    .values({
      name: demo.company.name,
      industry: demo.company.industry,
      timezone: demo.company.timezone,
      isDemo: true,
      sla: DEFAULT_SLA,
      watchCriteria: { items: [] },
      settings: {
        sendMode: "copy",
        retentionDays: 90,
        consentText: DEFAULT_CONSENT_TEXT,
        onboardingDone: false,
        signWithName: true,
      },
    })
    .returning();
  const companyId = company!.id;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userIds: Record<string, string> = {};
  for (const u of demo.users) {
    const [row] = await db
      .insert(users)
      .values({
        companyId,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role as Role,
        team: u.team,
      })
      .returning({ id: users.id });
    userIds[u.key] = row!.id;
  }

  const customerIds: Record<string, string> = {};
  for (const c of demo.customers) {
    const [row] = await db
      .insert(customers)
      .values({
        companyId,
        name: c.name,
        kind: c.kind as "broker" | "shipper",
        assignedUserId: userIds[c.assigned] ?? null,
      })
      .returning({ id: customers.id });
    customerIds[c.key] = row!.id;
  }

  for (const ch of demo.channels) {
    await db.insert(channels).values({
      companyId,
      source: "demo",
      externalId: ch.key,
      title: ch.title,
      chatType: ch.chat_type as ChatType,
      customerId: ch.customer ? customerIds[ch.customer]! : null,
    });
  }

  // Chat members as the chat platform knows them: display name + (for staff) the linked account.
  // Side is derived by the same rule live Telegram ingestion uses.
  for (const p of demo.people as { key: string; name: string; user?: string }[]) {
    const firstChannel = demo.messages.find((m) => m.from === p.key)?.channel;
    const chatType = demo.channels.find((c) => c.key === firstChannel)?.chat_type as
      ChatType | undefined;
    await db.insert(participants).values({
      companyId,
      source: "demo",
      externalId: p.key,
      displayName: p.name,
      userId: p.user ? userIds[p.user]! : null,
      side: sideFor({ linkedUser: Boolean(p.user), chatType: chatType ?? "customer" }),
    });
  }
  return companyId;
}

function channelTitle(key: string): string {
  return demo.channels.find((c) => c.key === key)?.title ?? key;
}

function personName(key: string): string {
  return demo.people.find((p) => p.key === key)?.name ?? key;
}

/** Inserts "yesterday" raw messages through the normal ingestion path. */
export async function loadYesterday(db: Db, companyId: string, now = new Date()): Promise<number> {
  const tz = demo.company.timezone;
  let count = 0;
  const msgs = (demo.messages as SeedMessage[])
    .map((m) => {
      const [h, min] = (m.time ?? "09:00").split(":").map(Number);
      return { m, sentAt: atLocalTime(now, tz, m.day ?? -1, h!, min!) };
    })
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  for (const { m, sentAt } of msgs) {
    const res = await ingestMessage(
      db,
      companyId,
      {
        source: "demo",
        channelExternalId: m.channel,
        channelTitle: channelTitle(m.channel),
        messageExternalId: m.key,
        senderExternalId: m.from,
        senderName: personName(m.from),
        text: m.text,
        sentAt,
        replyTo: m.reply_to ?? null,
      },
      { debounceMs: DEMO_DEBOUNCE_MS },
    );
    if (res.inserted) count++;
  }
  return count;
}

/** Feeds replay message #index stamped with the current time. */
export async function ingestReplayMessage(
  db: Db,
  companyId: string,
  index: number,
  now = new Date(),
): Promise<boolean> {
  const m = replayMessages[index];
  if (!m) return false;
  const res = await ingestMessage(
    db,
    companyId,
    {
      source: "demo",
      channelExternalId: m.channel,
      channelTitle: channelTitle(m.channel),
      // Unique per run so replay can be repeated after a reset.
      messageExternalId: `${m.key}-${now.getTime()}`,
      senderExternalId: m.from,
      senderName: personName(m.from),
      text: m.text,
      sentAt: now,
    },
    { debounceMs: DEMO_DEBOUNCE_MS },
  );
  return res.inserted;
}

/** Full demo from scratch: wipe, create, load yesterday (analysis gets queued). */
export async function seedDemo(
  db: Db,
  now = new Date(),
): Promise<{ companyId: string; messages: number }> {
  await resetDemo(db);
  const companyId = await createDemoCompany(db);
  const messages = await loadYesterday(db, companyId, now);
  return { companyId, messages };
}

export async function demoUserId(db: Db, companyId: string, email: string): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.email, email)));
  return u?.id ?? null;
}
