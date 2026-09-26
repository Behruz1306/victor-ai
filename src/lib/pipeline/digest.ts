import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { companies, customers, digests, signals, users, type Signal } from "@/lib/db/schema";
import { generateStructured } from "@/lib/llm";
import { OwnerDigest } from "@/lib/llm/schemas";
import { DIGEST_INSTRUCTIONS, renderDigestPrompt } from "@/lib/llm/prompts/other";
import { redactOutbound } from "@/lib/security/redact";
import type { DigestItem, L10n, WatchCriteria } from "@/lib/types";
import { matchCriterion } from "./audience";
import type { DigestCandidate } from "./types";

export const DIGEST_MAX = 5;

/** Pure ranking: severity × recency × owner-criteria match. Never more than 5. */
export function rankForOwner(
  list: Pick<Signal, "id" | "kind" | "severity" | "customerId" | "createdAt">[],
  criteria: WatchCriteria,
  now: Date,
): { id: string; score: number; criterion: string | null }[] {
  return list
    .map((s) => {
      const hours = Math.max(0, (now.getTime() - s.createdAt.getTime()) / 3_600_000);
      const recency = 1 + 1 / (1 + hours / 12); // 2 → 1 over ~a day
      const c = matchCriterion(criteria, s.kind, s.severity, s.customerId);
      const score = s.severity * recency * (c ? 1.5 : 1);
      return { id: s.id, score: Math.round(score * 100) / 100, criterion: c?.text ?? null };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, DIGEST_MAX);
}

function redactL10n(t: L10n): L10n {
  return { en: redactOutbound(t.en).text, ru: redactOutbound(t.ru).text };
}

export async function generateOwnerDigest(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<DigestItem[]> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return [];
  const open = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.companyId, companyId),
        eq(signals.status, "open"),
        eq(signals.audience, "owner"),
      ),
    )
    .orderBy(desc(signals.createdAt));
  const ranked = rankForOwner(open, company.watchCriteria, now);
  const byId = new Map(open.map((s) => [s.id, s]));
  const chosen = ranked.map((r) => ({ r, s: byId.get(r.id)! }));

  const custIds = [...new Set(chosen.map((c) => c.s.customerId).filter(Boolean) as string[])];
  const userIds = [
    ...new Set(chosen.map((c) => c.s.responsibleUserId).filter(Boolean) as string[]),
  ];
  const custNames = new Map(
    (custIds.length
      ? await db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(inArray(customers.id, custIds))
      : []
    ).map((c) => [c.id, c.name]),
  );
  const userNames = new Map(
    (userIds.length
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : []
    ).map((u) => [u.id, u.name]),
  );

  const candidates: DigestCandidate[] = chosen.map(({ r, s }) => ({
    signalId: s.id,
    kind: s.kind,
    severity: s.severity,
    customerName: s.customerId ? (custNames.get(s.customerId) ?? null) : null,
    responsibleName: s.responsibleUserId ? (userNames.get(s.responsibleUserId) ?? null) : null,
    title: s.title,
    reason: s.reason,
    evidenceQuote: s.evidenceQuote,
    createdAt: s.createdAt,
    criteriaMatch: r.criterion,
  }));

  let worded = new Map<string, { title: L10n; what: L10n; why: L10n }>();
  if (candidates.length) {
    const input = { now, companyName: company.name, candidates };
    const out = await generateStructured(
      OwnerDigest,
      { instructions: DIGEST_INSTRUCTIONS, prompt: renderDigestPrompt(input) },
      { model: "fast", task: "owner_digest", mockInput: input, log: { db, companyId } },
    );
    worded = new Map(
      (out?.items ?? []).map((i) => [
        i.signal_id,
        { title: i.title, what: i.what_happened, why: i.why_it_matters },
      ]),
    );
  }

  // Code keeps control of which items exist and in which order; the model only words them.
  const items: DigestItem[] = chosen.map(({ r, s }) => {
    const w = worded.get(s.id);
    return {
      signalId: s.id,
      kind: s.kind,
      severity: s.severity,
      customerId: s.customerId,
      customerName: s.customerId ? (custNames.get(s.customerId) ?? null) : null,
      taskId: s.taskId,
      channelId: s.channelId,
      responsibleUserId: s.responsibleUserId,
      responsibleName: s.responsibleUserId ? (userNames.get(s.responsibleUserId) ?? null) : null,
      evidenceQuote: s.evidenceQuote ? redactOutbound(s.evidenceQuote).text : null,
      title: redactL10n(w?.title ?? s.title),
      whatHappened: redactL10n(w?.what ?? s.reason),
      whyItMatters: redactL10n(w?.why ?? { en: "", ru: "" }),
      score: r.score,
    };
  });

  await db.insert(digests).values({ companyId, audience: "owner", items, generatedAt: now });
  return items;
}
