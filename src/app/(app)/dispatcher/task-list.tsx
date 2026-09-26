"use client";

import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { useT } from "@/components/providers";
import { MiniStepper } from "@/components/stepper";
import { useClock } from "@/components/common";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import type { DetailTask } from "./types";

export function TaskList({ tasks, timezone }: { tasks: DetailTask[]; timezone: string }) {
  const { t, lang } = useT();
  const clock = useClock(timezone);
  const open = tasks.filter((x) => x.status !== "delivered" && x.status !== "cancelled");
  const closed = tasks.filter((x) => x.status === "delivered");
  const row = (task: DetailTask) => (
    <li key={task.id}>
      <Link
        href={`/tasks/${task.id}`}
        className={cn(
          "flex flex-col gap-1.5 rounded-md border px-3 py-2 hover:bg-muted/50",
          task.stuckReason && "border-sev-5/40",
        )}
        data-testid={`task-${task.ref ?? task.id}`}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[13px] leading-snug font-medium">
            {pick(task.title, lang)}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <MiniStepper status={task.status} events={task.events} stuck={Boolean(task.stuckReason)} />
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn(
              task.stuckReason
                ? "font-medium text-sev-5"
                : task.status === "delivered"
                  ? "text-ok"
                  : "",
            )}
          >
            {t(`status.${task.status}` as TKey)}
          </span>
          <span>
            {task.deadlineAt
              ? `${t("task.deadline")}: ${clock(task.deadlineAt, true)}`
              : t("task.noDeadline")}
          </span>
        </div>
        {task.stuckReason ? (
          <p className="flex items-start gap-1 text-[11px] leading-snug text-sev-5">
            <AlertTriangle className="mt-px size-3 shrink-0" /> {pick(task.stuckReason, lang)}
          </p>
        ) : null}
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col gap-2">
      {open.length ? (
        <ul className="flex flex-col gap-2">{open.map(row)}</ul>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">{t("disp.noTasks")}</p>
      )}
      {closed.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer px-1 py-1 text-muted-foreground">
            {t("disp.recentlyClosed")} ({closed.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">{closed.map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}
