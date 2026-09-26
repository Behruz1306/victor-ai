"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageSquare,
  User,
  CalendarClock,
  Gauge,
  Bot,
  UserRound,
  Timer,
} from "lucide-react";
import type { Jsonify } from "@/lib/client/api";
import type { taskDetail } from "@/lib/queries/task";
import { useT } from "@/components/providers";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ChatTypeChip, SignalBadge, useClock } from "@/components/common";
import { TaskStepper, PATH } from "@/components/stepper";
import { pick } from "@/lib/types";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Detail = Jsonify<NonNullable<Awaited<ReturnType<typeof taskDetail>>>>;

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
      quote: e?.evidence?.text
        ? e.evidence.text.length > 180
          ? e.evidence.text.slice(0, 179) + "…"
          : e.evidence.text
        : null,
      evidenceId: e?.evidence?.id ?? null,
      explanation: e ? pick(e.explanation, lang) : "",
    };
  });
  const openSignals = detail.signals.filter((s) => s.status === "open");
  const past = detail.signals.filter((s) => s.status !== "open");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => router.back()}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {t("common.back")}
          </button>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="task-title">
            {pick(task.title, lang)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge tone="outline">{t(`kind.${task.kind}` as TKey)}</Badge>
            <span>
              {t("task.customer")}: <strong className="text-foreground">{task.customerName}</strong>
            </span>
            {task.ref ? <span className="font-mono text-xs">#{task.ref}</span> : null}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/dispatcher?c=${task.customerId}${task.channelId ? `&ch=${task.channelId}` : ""}`}
          >
            <MessageSquare /> {t("task.openChat")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={<User />}
          label={t("task.responsible")}
          value={task.responsibleName ?? t("common.unassigned")}
        />
        <Fact
          icon={<CalendarClock />}
          label={t("task.deadline")}
          value={task.deadlineAt ? clock(task.deadlineAt, true) : t("task.noDeadline")}
        />
        <Fact
          icon={<MessageSquare />}
          label={t("task.requestedIn")}
          value={
            <span className="flex items-center gap-1.5">
              <ChatTypeChip type={task.chatType} /> {task.channelTitle ?? "—"}
            </span>
          }
        />
        <Fact
          icon={<Gauge />}
          label={t("task.risk")}
          value={
            <span
              className={cn(
                task.risk >= 3
                  ? "text-sev-5"
                  : task.risk >= 2
                    ? "text-sev-4"
                    : task.risk >= 1
                      ? "text-sev-3"
                      : "text-ok",
              )}
            >
              {task.risk}/3
            </span>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("task.path")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskStepper
            status={task.status}
            steps={steps}
            stuckReason={task.stuckReason ? pick(task.stuckReason, lang) : null}
            clock={clock}
          />
          {task.status === "cancelled" ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("status.cancelled")}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("task.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative flex flex-col gap-3 border-l pl-4">
              {detail.events.map((e) => (
                <li
                  key={e.id}
                  id={e.evidence?.id ? `m-${e.evidence.id}` : undefined}
                  className="relative"
                >
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <strong className="text-sm">{t(`status.${e.to}` as TKey)}</strong>
                    <span className="font-mono text-muted-foreground">{clock(e.at, true)}</span>
                    <Badge tone="neutral">
                      {e.actor === "ai" ? <Bot /> : e.actor === "sla" ? <Timer /> : <UserRound />}
                      {t(`task.actor.${e.actor}` as TKey)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {pick(e.explanation, lang)}
                  </p>
                  {e.evidence ? (
                    <blockquote className="mt-1 rounded border-l-2 border-primary/40 bg-muted/50 px-2 py-1 text-xs">
                      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ChatTypeChip type={e.evidence.chatType} /> {e.evidence.channelTitle} ·{" "}
                        {e.evidence.sender} · {e.evidence.sentAt ? clock(e.evidence.sentAt) : ""}
                      </div>
                      {e.evidence.text}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("task.signals")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {openSignals.length === 0 && past.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : null}
            {[...openSignals, ...past].map((s) => (
              <div
                key={s.id}
                className={cn("flex flex-col gap-1", s.status !== "open" && "opacity-60")}
              >
                <div className="flex items-center gap-2">
                  <SignalBadge kind={s.kind} severity={s.severity} />
                  {s.status !== "open" ? <Badge tone="ok">{s.status}</Badge> : null}
                </div>
                <p className="text-sm">{pick(s.reason, lang)}</p>
                {s.evidenceQuote ? (
                  <p className="text-xs text-muted-foreground italic">“{s.evidenceQuote}”</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </Card>
  );
}
