import type { Audience, SignalKind } from "@/lib/db/schema";
import type { WatchCriteria, WatchCriterion } from "@/lib/types";

/** Which owner criterion (if any) a signal matches. */
export function matchCriterion(
  criteria: WatchCriteria,
  kind: SignalKind,
  severity: number,
  customerId: string | null,
): WatchCriterion | null {
  return (
    criteria.items.find(
      (c) =>
        c.kinds.includes(kind) &&
        severity >= (c.minSeverity || 1) &&
        (!c.customerIds.length || (customerId !== null && c.customerIds.includes(customerId))),
    ) ?? null
  );
}

/**
 * Highest audience a signal reaches. Dispatchers always see everything for their customers;
 * the lead gets severity ≥ 3; the owner gets severity ≥ 4 or anything matching his criteria.
 */
export function routeAudience(
  severity: number,
  kind: SignalKind,
  customerId: string | null,
  criteria: WatchCriteria,
): Audience {
  if (severity >= 4 || matchCriterion(criteria, kind, severity, customerId)) return "owner";
  if (severity >= 3) return "lead";
  return "dispatcher";
}
