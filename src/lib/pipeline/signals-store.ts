import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { signals, type Audience, type SignalKind } from "@/lib/db/schema";
import type { L10n } from "@/lib/types";

export type SignalWrite = {
  dedupeKey: string;
  kind: SignalKind;
  severity: number;
  audience: Audience;
  customerId: string | null;
  channelId: string | null;
  taskId: string | null;
  responsibleUserId: string | null;
  title: L10n;
  reason: L10n;
  evidenceQuote: string | null;
  evidenceMessageId: string | null;
  source: "ai" | "sla";
};

/** Opens a signal, or refreshes the open one with the same dedupe key. Returns true if new. */
export async function upsertSignal(db: Db, companyId: string, s: SignalWrite): Promise<boolean> {
  const severity = Math.max(1, Math.min(5, Math.round(s.severity)));
  const rows = await db
    .insert(signals)
    .values({ ...s, severity, companyId })
    .onConflictDoUpdate({
      target: [signals.companyId, signals.dedupeKey],
      targetWhere: sql`status = 'open'`,
      set: {
        severity,
        audience: s.audience,
        title: s.title,
        reason: s.reason,
        responsibleUserId: s.responsibleUserId,
        evidenceQuote: s.evidenceQuote,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return Boolean(rows[0]?.inserted);
}

export async function resolveSignal(db: Db, companyId: string, id: string): Promise<void> {
  await db
    .update(signals)
    .set({ status: "resolved", resolvedAt: sql`now()` })
    .where(and(eq(signals.id, id), eq(signals.companyId, companyId), eq(signals.status, "open")));
}
