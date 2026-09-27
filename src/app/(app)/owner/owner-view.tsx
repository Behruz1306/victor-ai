"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, ListChecks, ShieldAlert, Timer, Eye, Sparkles } from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { ownerOverview } from "@/lib/queries/owner";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState } from "@/components/ui/primitives";
import {
  Avatar,
  DemoDataTag,
  EvidenceQuote,
  SignalBadge,
  TimeAgo,
  severityLevel,
} from "@/components/common";
import { KpiTile } from "@/components/kpi-tile";
import { EmptyState } from "@/components/empty-state";
import { formatDuration, pluralRu } from "@/lib/i18n";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Onboarding } from "./onboarding";

type Data = Jsonify<Awaited<ReturnType<typeof ownerOverview>>>;
type Item = Data["digest"]["items"][number];

const RAIL: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
};

export function OwnerView({ timezone }: { timezone: string }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["owner"],
    queryFn: () => apiGet<Data>("/api/owner"),
    refetchInterval: POLL_MS,
  });
  const refresh = useMutation({
    mutationFn: () => apiPost("/api/owner/digest"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner"] }),
  });
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  if (q.isError)
    return (
      <div className="px-4 py-6 sm:px-8">
        <ErrorState
          message={t("common.error")}
          onRetry={() => q.refetch()}
          retryLabel={t("common.retry")}
        />
      </div>
    );
  const d = q.data;
  const items = d?.digest.items ?? [];
  const k = d?.kpis;
  const today = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const windowLabel =
    k?.window.kind === "demoScenario" ? t("owner.windowDemo") : t("owner.window24h");

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-fg-3 first-letter:uppercase" suppressHydrationWarning>
          {today}
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-fg sm:text-3xl" data-testid="owner-headline">
            {d
              ? items.length
                ? items.length === 1
                  ? t("owner.headlineOne")
                  : t("owner.headline", {
                      n: items.length,
                      things: pluralRu(items.length, "вопрос", "вопроса", "вопросов"),
                    })
                : t("owner.headlineCalm")
              : " "}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            aria-label={t("owner.refresh")}
            title={t("owner.refresh")}
            data-testid="owner-refresh"
            className="mt-0.5 shrink-0"
          >
            <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
          </Button>
        </div>
        <p className="text-base text-fg-3">
          {t("owner.promise")}
          {d?.digest.generatedAt ? (
            <>
              {" "}
              · {t("owner.updated")} <TimeAgo date={d.digest.generatedAt} />
            </>
          ) : null}
        </p>
      </header>

      {d && !d.onboardingDone && !showOnboarding ? (
        <button
          onClick={() => setShowOnboarding(true)}
          className="group flex items-center gap-3 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3 text-left transition-colors hover:border-accent/50"
          data-testid="onboarding-banner"
        >
          <Eye className="size-5 shrink-0 text-accent-text" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium text-fg">{t("onb.title")}</span>
            <span className="block text-sm text-fg-2">{t("onb.subtitle")}</span>
          </span>
          <ArrowRight
            className="size-4 shrink-0 text-accent-text transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      ) : null}
      {showOnboarding ? <Onboarding onClose={() => setShowOnboarding(false)} /> : null}

      <section aria-label={t("owner.kpis")} className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            testId="kpi-open"
            icon={<ListChecks />}
            label={t("owner.kpiOpen")}
            value={k ? k.openTasks : null}
            series={k?.trend.open}
            delta={
              k?.trend.delta.open != null
                ? { value: k.trend.delta.open, better: "down", label: t("owner.vs24h") }
                : null
            }
            context={k?.trend.delta.open == null ? windowLabel : undefined}
          />
          <KpiTile
            testId="kpi-risk"
            icon={<ShieldAlert />}
            label={t("owner.kpiRisk")}
            value={k ? k.atRisk : null}
            tone="critical"
            series={k?.trend.risk}
            delta={
              k?.trend.delta.risk != null
                ? { value: k.trend.delta.risk, better: "down", label: t("owner.vs24h") }
                : null
            }
            context={k?.trend.delta.risk == null ? t("owner.riskHint") : undefined}
          />
          <KpiTile
            testId="kpi-ack"
            icon={<Timer />}
            label={t("owner.kpiAckShort")}
            value={k ? k.avgAckMinutes : null}
            format={(n) => formatDuration(lang, n)}
            emptyText={t("owner.kpiAckNone")}
            series={k?.trend.ack}
            delta={
              k?.trend.delta.ack != null
                ? {
                    value: k.trend.delta.ack,
                    better: "down",
                    label: t("owner.vsPrev"),
                    format: (n) => formatDuration(lang, Math.abs(n)),
                  }
                : null
            }
            context={k ? `${windowLabel} · n = ${k.ackSample}` : undefined}
          />
        </div>
        {d?.isDemo ? (
          <div className="flex justify-end">
            <DemoDataTag />
          </div>
        ) : null}
      </section>

      <section
        className="flex flex-col gap-3"
        data-testid="owner-digest"
        aria-label={t("owner.attention")}
      >
        {q.isLoading ? (
          [0, 1, 2].map((i) => <div key={i} className="skeleton h-44 rounded-lg" />)
        ) : items.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState illustration="calm" title={t("owner.empty")} hint={t("owner.emptyHint")} />
          </div>
        ) : (
          items.map((it, i) => (
            <AttentionCard key={it.signalId} it={it} rank={i + 1} timezone={timezone} />
          ))
        )}
      </section>

      {d && d.criteria.length ? (
        <section className="flex flex-wrap items-center gap-1.5 text-sm text-fg-3">
          <Eye className="size-3.5" aria-hidden /> {t("owner.criteria")}:
          {d.criteria.map((c) => (
            <Badge key={c.id} tone="outline">
              {c.text}
            </Badge>
          ))}
          <Link href="/settings#criteria" className="text-accent-text hover:underline">
            {t("owner.editCriteria")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function AttentionCard({ it, rank, timezone }: { it: Item; rank: number; timezone: string }) {
  const { t, lang } = useT();
  const level = severityLevel(it.severity);
  const href = it.taskId
    ? `/tasks/${it.taskId}`
    : `/dispatcher?c=${it.customerId ?? ""}${it.channelId ? `&ch=${it.channelId}` : ""}`;
  const why = pick(it.whyItMatters, lang);
  return (
    <article
      className="relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-surface p-4 pl-5 animate-enter sm:p-5 sm:pl-6"
      style={{ animationDelay: `${rank * 40}ms` }}
      data-testid="digest-item"
    >
      <span aria-hidden className={cn("absolute top-0 bottom-0 left-0 w-1", RAIL[level])} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="num font-mono text-xs text-fg-3">{String(rank).padStart(2, "0")}</span>
        <SignalBadge kind={it.kind} severity={it.severity} />
        {it.customerName ? (
          <span className="text-sm font-medium text-fg-2">{it.customerName}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-fg">{pick(it.title, lang)}</h2>
        <p className="text-base text-fg-2">{pick(it.whatHappened, lang)}</p>
        {why ? (
          <p className="flex gap-1.5 text-sm text-fg-3">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
            <span>
              <span className="font-medium text-fg-2">{t("owner.why")}: </span>
              {why}
            </span>
          </p>
        ) : null}
      </div>
      {it.evidenceQuote ? (
        <EvidenceQuote
          text={it.evidenceQuote}
          chatType={it.evidence?.chatType ?? null}
          chatTitle={it.evidence?.chatTitle}
          sender={it.evidence?.sender}
          at={it.evidence?.sentAt}
          timezone={timezone}
          clamp={3}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="flex min-w-0 items-center gap-2 text-sm text-fg-3">
          <Avatar name={it.responsibleName ?? "?"} size={24} />
          <span className="truncate">
            {t("owner.who")}:{" "}
            <span className="font-medium text-fg">
              {it.responsibleName ?? t("common.unassigned")}
            </span>
          </span>
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={href} data-testid="digest-open">
            {t("common.open")} <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}
