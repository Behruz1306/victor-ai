"use client";

import Link from "next/link";
import { ChevronRight, OctagonAlert } from "lucide-react";
import { useT } from "@/components/providers";
import { MiniStepper } from "@/components/stepper";
import { useClock } from "@/components/common";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import type { DetailTask } from "./types";

export function TaskList({
  tasks,
  timezone,
  freshIds,
}: {
  tasks: DetailTask[];
  timezone: string;
  freshIds: Set<string>;
}) {
  const { t, lang } = useT();
  const clock = useClock(timezone);
  const open = tasks.filter((x) => x.status !== "delivered" && x.status !== "cancelled");
  const closed = tasks.filter((x) => x.status === "delivered");
  const row = (task: DetailTask) => (
    <li key={task.id}>
      <Link
        href={`/tasks/${task.id}`}
        className={cn(
          "group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2",
          freshIds.has(task.id) && "animate-glow",
        )}
        data-testid={`task-${task.ref ?? task.id}`}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-sm leading-snug font-medium text-fg">
            {pick(task.title, lang)}
          </span>
          <ChevronRight
            className="mt-0.5 size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
        <MiniStepper status={task.status} events={task.events} stuck={Boolean(task.stuckReason)} />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className={cn(
              "font-medium",
              task.stuckReason
                ? "text-critical"
                : task.status === "delivered"
                  ? "text-ok"
                  : "text-fg-2",
            )}
          >
            {t(`status.${task.status}` as TKey)}
          </span>
          <span className="num font-mono text-fg-3">
            {task.deadlineAt
              ? `${t("task.due")} ${clock(task.deadlineAt, true)}`
              : t("task.noDeadline")}
          </span>
        </div>
        {task.stuckReason ? (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-critical">
            <OctagonAlert className="mt-px size-3 shrink-0" aria-hidden />{" "}
            {pick(task.stuckReason, lang)}
          </p>
        ) : null}
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col">
      {open.length ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-surface">{open.map(row)}</ul>
      ) : (
        <p className="px-1 text-sm text-fg-3">{t("disp.noTasks")}</p>
      )}
      {closed.length ? (
        <details className="group mt-2 text-sm">
          <summary className="cursor-pointer list-none px-1 py-1 text-fg-3 hover:text-fg-2">
            {t("disp.recentlyClosed")} <span className="num">({closed.length})</span>
          </summary>
          <ul className="mt-1 divide-y overflow-hidden rounded-lg border bg-surface">
            {closed.map(row)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
