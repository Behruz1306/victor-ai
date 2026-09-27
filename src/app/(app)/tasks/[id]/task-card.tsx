"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MessageSquare, Bot, UserRound, Timer, Hash } from "lucide-react";
import type { Jsonify } from "@/lib/client/api";
import type { taskDetail } from "@/lib/queries/task";
import { useT } from "@/components/providers";
import { Badge, SectionLabel } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  ChatTypeChip,
  EvidenceQuote,
  SeverityBadge,
  SignalBadge,
  useClock,
} from "@/components/common";
import { StatusStepper, PATH } from "@/components/stepper";
import { pick } from "@/lib/types";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Detail = Jsonify<NonNullable<Awaited<ReturnType<typeof taskDetail>>>>;

const RISK_LEVEL = ["ok", "low", "medium", "high"] as const;

export function TaskCard({ detail }: { detail: Detail }) {
  const { t, lang } = useT();
  const router = useRouter();
  const clock = useClock(detail.timezone);
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);

  const task = detail.task;
  const steps = PATH.map((s) => {
    const e = detail.events.find((x) => x.to === s);
    return {
      status: s,
      at: e?.at ?? null,
      quote: e?.evidence?.text ?? null,
      evidenceId: e?.evidence?.id ?? null,
      explanation: e ? pick(e.explanation, lang) : "",
      chatType: e?.evidence?.chatType ?? null,
      chatTitle: e?.evidence?.channelTitle ?? null,
      sender: e?.evidence?.sender ?? null,
    };
  });
  const lastEvent = detail.events.at(-1);
  const openSignals = detail.signals.filter((s) => s.status === "open");
  const past = detail.signals.filter((s) => s.status !== "open");
  const closed = task.status === "delivered" || task.status === "cancelled";
  const risk = RISK_LEVEL[Math.max(0, Math.min(3, task.risk))]!;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-3">
        <Link
          href={`/dispatcher?c=${task.customerId}${task.channelId ? `&ch=${task.channelId}` : ""}`}
          className="flex w-fit items-center gap-1 text-sm text-fg-3 hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden /> {task.customerName}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold text-fg" data-testid="task-title">
              {pick(task.title, lang)}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-3">
              <Badge tone="neutral">{t(`kind.${task.kind}` as TKey)}</Badge>
              {task.ref ? (
                <span className="num inline-flex items-center gap-0.5 font-mono text-fg-2">
                  <Hash className="size-3.5 text-fg-3" aria-hidden />
                  {task.ref}
                </span>
              ) : null}
              <span aria-hidden>·</span>
              <span
                className={cn(
                  "font-medium",
                  task.stuckReason && !closed ? "text-critical" : closed ? "text-ok" : "text-fg-2",
                )}
              >
                {t(`status.${task.status}` as TKey)}
                {task.stuckReason && !closed ? ` · ${t("task.stuck")}` : ""}
              </span>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link
              href={`/dispatcher?c=${task.customerId}${task.channelId ? `&ch=${task.channelId}` : ""}`}
            >
              <MessageSquare /> {t("task.openChat")}
            </Link>
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        <Fact label={t("task.responsible")}>
          <Avatar name={task.responsibleName ?? "?"} size={20} />
          <span className="truncate">{task.responsibleName ?? t("common.unassigned")}</span>
        </Fact>
        <Fact label={t("task.deadline")}>
          <span className={cn("num font-mono", !task.deadlineAt && "font-sans text-fg-3")}>
            {task.deadlineAt ? clock(task.deadlineAt, true) : t("task.noDeadline")}
          </span>
        </Fact>
        <Fact label={t("task.requestedIn")}>
          <ChatTypeChip type={task.chatType} compact />
          <span className="truncate">{task.channelTitle ?? "—"}</span>
        </Fact>
        <Fact label={t("task.risk")}>
          {risk === "ok" ? (
            <SeverityBadge level="ok" label={t("task.riskNone")} />
          ) : (
            <SeverityBadge level={risk} />
          )}
        </Fact>
      </dl>

      <section className="rounded-lg border bg-surface p-5 sm:p-6" aria-label={t("task.path")}>
        <SectionLabel className="mb-5 px-0">{t("task.path")}</SectionLabel>
        <StatusStepper
          status={task.status}
          steps={steps}
          stuckReason={task.stuckReason && !closed ? pick(task.stuckReason, lang) : null}
          stuckSince={lastEvent?.at ?? null}
          timezone={detail.timezone}
        />
        {task.status === "cancelled" ? (
          <p className="mt-3 text-sm text-fg-3">{t("status.cancelled")}</p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-3">
          <SectionLabel>{t("task.history")}</SectionLabel>
          <ol className="relative flex flex-col gap-5 rounded-lg border bg-surface p-5">
            {detail.events.map((e, i) => (
              <li
                key={e.id}
                className="relative flex gap-3"
                id={e.evidence?.id ? `m-${e.evidence.id}` : undefined}
              >
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1.5 size-2 rounded-full",
                      i === detail.events.length - 1 ? "bg-accent" : "bg-border-strong",
                    )}
                  />
                  {i < detail.events.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-border" />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-fg">
                      {t(`status.${e.to}` as TKey)}
                    </span>
                    <span className="num font-mono text-xs text-fg-3">{clock(e.at, true)}</span>
                    <Badge tone="neutral" className="h-[18px] text-xs">
                      {e.actor === "ai" ? <Bot /> : e.actor === "sla" ? <Timer /> : <UserRound />}
                      {t(`task.actor.${e.actor}` as TKey)}
                    </Badge>
                  </div>
                  <p className="text-sm text-fg-2">{pick(e.explanation, lang)}</p>
                  {e.evidence ? (
                    <EvidenceQuote
                      text={e.evidence.text}
                      chatType={e.evidence.chatType}
                      chatTitle={e.evidence.channelTitle}
                      sender={e.evidence.sender}
                      at={e.evidence.sentAt}
                      timezone={detail.timezone}
                      clamp={4}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel aside={<span className="num text-xs text-fg-3">{openSignals.length}</span>}>
            {t("task.signals")}
          </SectionLabel>
          <div className="flex flex-col divide-y overflow-hidden rounded-lg border bg-surface">
            {openSignals.length === 0 && past.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-fg-3">{t("task.noSignals")}</p>
            ) : null}
            {[...openSignals, ...past].map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex flex-col gap-1.5 px-4 py-3",
                  s.status !== "open" && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  <SignalBadge kind={s.kind} severity={s.severity} />
                  {s.status !== "open" ? <Badge tone="ok">{t("task.resolved")}</Badge> : null}
                </div>
                <p className="text-sm text-fg-2">{pick(s.reason, lang)}</p>
              </div>
            ))}
          </div>
          {detail.suggestions.length ? (
            <>
              <SectionLabel className="mt-3">{t("task.suggestions")}</SectionLabel>
              <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-surface">
                {detail.suggestions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-fg-3">
                      <span className="font-medium text-fg-2">
                        {t(`intent.${s.intent}` as TKey)}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{t(`sugStatus.${s.status}` as TKey)}</span>
                    </div>
                    <p className="line-clamp-3 text-sm text-fg">{s.text}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-3">
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-base font-medium text-fg">{children}</dd>
    </div>
  );
}
