"use client";

import { Check, AlertTriangle, X } from "lucide-react";
import { useT } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

export const PATH = [
  "received",
  "acknowledged",
  "in_progress",
  "deadline_set",
  "delivered",
] as const;

type Ev = { toStatus: string; at: string | Date };

function reachedAt(events: Ev[], status: string): Date | null {
  const e = events.find((x) => x.toStatus === status);
  return e ? new Date(e.at) : null;
}

/** Compact 5-segment path for task lists. */
export function MiniStepper({
  status,
  events,
  stuck,
}: {
  status: string;
  events: Ev[];
  stuck: boolean;
}) {
  const { t } = useT();
  const cur = PATH.indexOf(status as (typeof PATH)[number]);
  return (
    <div className="flex items-center gap-0.5" aria-label={t(`status.${status}` as TKey)}>
      {PATH.map((s, i) => {
        const done = i <= cur && (reachedAt(events, s) || i === cur);
        const skipped = i < cur && !reachedAt(events, s);
        return (
          <span
            key={s}
            title={t(`status.${s}` as TKey)}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              status === "cancelled"
                ? "bg-muted-foreground/30"
                : i === cur && stuck
                  ? "bg-sev-5"
                  : done
                    ? status === "delivered"
                      ? "bg-ok"
                      : "bg-primary"
                    : skipped
                      ? "bg-primary/30"
                      : "bg-border",
            )}
          />
        );
      })}
    </div>
  );
}

/** Full horizontal stepper for the task card. */
export function TaskStepper({
  status,
  steps,
  stuckReason,
  clock,
}: {
  status: string;
  steps: {
    status: string;
    at: string | Date | null;
    quote: string | null;
    evidenceId: string | null;
    explanation: string;
  }[];
  stuckReason: string | null;
  clock: (d: string | Date, withDay?: boolean) => string;
}) {
  const { t } = useT();
  const cur = PATH.indexOf(status as (typeof PATH)[number]);
  return (
    <ol className="grid gap-3 md:grid-cols-5">
      {PATH.map((s, i) => {
        const step = steps.find((x) => x.status === s);
        const reached = Boolean(step?.at) || (status !== "cancelled" && i <= cur);
        const stuckHere = Boolean(stuckReason) && i === cur && status !== "delivered";
        const next = !reached && i === cur + 1;
        return (
          <li
            key={s}
            className={cn(
              "relative flex flex-col gap-1.5 rounded-lg border p-3",
              stuckHere
                ? "border-sev-5/60 bg-sev-5-soft"
                : reached
                  ? "border-primary/30 bg-card"
                  : "border-dashed bg-muted/40",
            )}
            data-testid={`step-${s}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  stuckHere
                    ? "bg-sev-5 text-white"
                    : reached
                      ? status === "delivered"
                        ? "bg-ok text-white"
                        : "bg-primary text-primary-foreground"
                      : "bg-border text-muted-foreground",
                )}
              >
                {stuckHere ? (
                  <AlertTriangle className="size-3.5" />
                ) : reached ? (
                  <Check className="size-3.5" />
                ) : status === "cancelled" ? (
                  <X className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={cn("text-sm font-semibold", !reached && "text-muted-foreground")}>
                {t(`status.${s}` as TKey)}
              </span>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {step?.at ? clock(step.at, true) : next ? "…" : t("task.notReached")}
            </div>
            {step?.quote ? (
              <a
                href={step.evidenceId ? `#m-${step.evidenceId}` : undefined}
                className="line-clamp-4 rounded border-l-2 border-primary/40 bg-muted/50 px-2 py-1 text-xs leading-snug hover:bg-muted"
              >
                “{step.quote}”
              </a>
            ) : null}
            {step?.explanation && !step.quote ? (
              <p className="text-xs text-muted-foreground">{step.explanation}</p>
            ) : null}
            {stuckHere ? (
              <p className="text-xs font-medium text-sev-5">
                {t("task.stuckHere")}: {stuckReason}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
