import type { TaskStatus } from "@/lib/db/schema";

export const PATH: readonly TaskStatus[] = [
  "received",
  "acknowledged",
  "in_progress",
  "deadline_set",
  "delivered",
] as const;

export const TERMINAL = new Set<TaskStatus>(["delivered", "cancelled"]);

export type TransitionRequest = {
  /** null = the task is being created by this update. */
  current: TaskStatus | null;
  proposed: TaskStatus;
  /** The evidence message exists in the analysis context. */
  evidenceExists: boolean;
  /** ISO string from the model; required for deadline_set. */
  deadline: string | null;
};

export type TransitionPlan =
  | {
      ok: true;
      /** Statuses to log in order; all but the last are implied by the same evidence. */
      steps: TaskStatus[];
      deadlineAt: Date | null;
      closed: boolean;
      note?: string;
    }
  | { ok: false; reason: "evidence_missing" | "terminal" | "not_forward" | "deadline_missing" };

export function parseDeadlineIso(value: string | null): Date | null {
  if (!value) return null;
  // Must carry a date and a time; bare words ("soon", "EOD") are rejected.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The only way a task changes status. Forward-only along PATH (skipping is allowed when one
 * message proves several steps), plus `cancelled` from any open state. Evidence is mandatory;
 * `deadline_set` requires a parseable deadline, otherwise the move is downgraded to
 * `in_progress` (or rejected when that would not be forward).
 */
export function planTransition(req: TransitionRequest): TransitionPlan {
  if (!req.evidenceExists) return { ok: false, reason: "evidence_missing" };
  if (req.current && TERMINAL.has(req.current)) return { ok: false, reason: "terminal" };

  if (req.proposed === "cancelled") {
    return {
      ok: true,
      steps: req.current ? ["cancelled"] : ["received", "cancelled"],
      deadlineAt: null,
      closed: true,
    };
  }

  let proposed = req.proposed;
  let note: string | undefined;
  const deadlineAt = parseDeadlineIso(req.deadline);
  if (proposed === "deadline_set" && !deadlineAt) {
    proposed = "in_progress";
    note = "deadline_set downgraded: no parseable deadline";
  }

  const from = req.current ? PATH.indexOf(req.current) : -1;
  const to = PATH.indexOf(proposed);
  if (to <= from) {
    return { ok: false, reason: note ? "deadline_missing" : "not_forward" };
  }

  const steps: TaskStatus[] = [];
  for (let i = from + 1; i <= to; i++) {
    const s = PATH[i]!;
    // A deadline is never implied: it only appears when the evidence names one.
    if (s === "deadline_set" && s !== proposed && !deadlineAt) continue;
    steps.push(s);
  }
  return {
    ok: true,
    steps,
    deadlineAt:
      proposed === "deadline_set" || (deadlineAt && steps.includes("deadline_set"))
        ? deadlineAt
        : null,
    closed: proposed === "delivered",
    note,
  };
}

/** Index along the path, for the stepper UI (cancelled → -1). */
export function stepIndex(status: TaskStatus): number {
  return PATH.indexOf(status);
}
