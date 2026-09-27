"use client";

import * as React from "react";
import { Check, OctagonAlert, X } from "lucide-react";
import { useT } from "@/components/providers";
import { EvidenceQuote, useClock } from "@/components/common";
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

/** Compact 5-segment path for lists; the newest segment fills forward. */
export function MiniStepper({
  status,
  events,
  stuck,
  className,
}: {
  status: string;
  events: Ev[];
  stuck: boolean;
  className?: string;
}) {
  const { t } = useT();
  const cur = PATH.indexOf(status as (typeof PATH)[number]);
  return (
    <div
      className={cn("flex items-center gap-[3px]", className)}
      role="img"
      aria-label={`${t(`status.${status}` as TKey)}${stuck ? ` · ${t("task.stuck")}` : ""}`}
    >
      {PATH.map((s, i) => {
        const done = status !== "cancelled" && i <= cur;
        const skipped = done && i < cur && !reachedAt(events, s);
        const tone =
          status === "cancelled"
            ? "bg-fg-3/40"
            : i === cur && stuck
              ? "bg-critical"
              : status === "delivered"
                ? "bg-ok"
                : skipped
                  ? "bg-accent/35"
                  : "bg-accent";
        return (
          <span
            key={s}
            title={t(`status.${s}` as TKey)}
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            {done ? (
              <span
                className={cn(
                  "block h-full w-full origin-left rounded-full",
                  tone,
                  i === cur && "animate-fill",
                )}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "3 h 12 min" — the live "time stuck" counter. */
export function StuckFor({ since, className }: { since: string | Date; className?: string }) {
  const { lang } = useT();
  const now = useNow(30_000);
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts =
    lang === "ru"
      ? [d ? `${d} д` : "", h ? `${h} ч` : "", `${m} мин`]
      : [d ? `${d} d` : "", h ? `${h} h` : "", `${m} min`];
  return (
    <span className={cn("num font-mono", className)} suppressHydrationWarning>
      {parts.filter(Boolean).join(" ")}
    </span>
  );
}

export type StepInfo = {
  status: string;
  at: string | Date | null;
  quote: string | null;
  evidenceId: string | null;
  explanation: string;
  chatType?: string | null;
  chatTitle?: string | null;
  sender?: string | null;
};

/** Large horizontal path for the task card: time + evidence per step, the stuck step called out. */
export function StatusStepper({
  status,
  steps,
  stuckReason,
  stuckSince,
  timezone,
}: {
  status: string;
  steps: StepInfo[];
  stuckReason: string | null;
  stuckSince: string | Date | null;
  timezone: string;
}) {
  const { t } = useT();
  const clock = useClock(timezone);
  const cur = PATH.indexOf(status as (typeof PATH)[number]);
  const cancelled = status === "cancelled";
  return (
    <ol className="grid grid-cols-1 gap-0 md:grid-cols-5" aria-label={t("task.path")}>
      {PATH.map((s, i) => {
        const step = steps.find((x) => x.status === s);
        const reached = !cancelled && (Boolean(step?.at) || i <= cur);
        const stuckHere = Boolean(stuckReason) && i === cur && status !== "delivered";
        const lineDone = !cancelled && i < cur;
        return (
          <li
            key={s}
            className="relative flex gap-3 pb-6 md:flex-col md:gap-0 md:pr-4 md:pb-0"
            data-testid={`step-${s}`}
            aria-current={i === cur ? "step" : undefined}
          >
            {/* connector */}
            {i < PATH.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-7 bottom-0 left-[13px] w-px bg-border md:top-[13px] md:right-0 md:bottom-auto md:left-7 md:h-px md:w-auto"
              >
                {lineDone ? (
                  <span
                    className={cn(
                      "block size-full origin-top md:origin-left",
                      status === "delivered" ? "bg-ok" : "bg-accent",
                      i === cur - 1 && "animate-fill",
                    )}
                  />
                ) : null}
              </span>
            ) : null}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                stuckHere
                  ? "border-critical bg-critical text-white ring-4 ring-critical-soft"
                  : reached
                    ? status === "delivered"
                      ? "border-ok bg-ok text-white"
                      : "border-accent bg-accent text-accent-fg"
                    : "border-border-strong bg-surface text-fg-3",
              )}
            >
              {stuckHere ? (
                <OctagonAlert className="size-3.5" aria-hidden />
              ) : reached ? (
                <Check className="size-3.5" aria-hidden />
              ) : cancelled ? (
                <X className="size-3.5" aria-hidden />
              ) : (
                <span className="num">{i + 1}</span>
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:mt-3">
              <div className="flex items-baseline justify-between gap-2 md:flex-col md:items-start md:gap-0.5">
                <span className={cn("text-base font-medium", reached ? "text-fg" : "text-fg-3")}>
                  {t(`status.${s}` as TKey)}
                </span>
                <span className="num font-mono text-xs text-fg-3">
                  {step?.at
                    ? clock(step.at, true)
                    : reached
                      ? t("task.implied")
                      : t("task.notReached")}
                </span>
              </div>
              {stuckHere ? (
                <div
                  className="rounded-md border border-critical-border bg-critical-soft px-2.5 py-2 text-sm text-critical"
                  role="status"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <OctagonAlert className="size-3.5" aria-hidden /> {t("task.stuckHere")}
                  </div>
                  <p className="mt-0.5 leading-snug">{stuckReason}</p>
                  {stuckSince ? (
                    <p className="mt-1 text-xs">
                      {t("task.stuckFor")} <StuckFor since={stuckSince} className="font-semibold" />
                    </p>
                  ) : null}
                </div>
              ) : null}
              {step?.quote ? (
                <EvidenceQuote
                  text={step.quote}
                  chatType={step.chatType}
                  chatTitle={step.chatTitle}
                  sender={step.sender}
                  href={step.evidenceId ? `#m-${step.evidenceId}` : null}
                  clamp={4}
                  className="py-1.5 md:mr-1"
                />
              ) : step?.explanation ? (
                <p className="text-sm text-fg-3">{step.explanation}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Back-compat wrapper (older call sites). */
export function TaskStepper(props: {
  status: string;
  steps: StepInfo[];
  stuckReason: string | null;
  clock?: unknown;
  timezone?: string;
  stuckSince?: string | Date | null;
}) {
  return (
    <StatusStepper
      status={props.status}
      steps={props.steps}
      stuckReason={props.stuckReason}
      stuckSince={props.stuckSince ?? null}
      timezone={props.timezone ?? "America/Chicago"}
    />
  );
}
