"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  RefreshCw,
  ListChecks,
  ShieldAlert,
  Timer,
  Sun,
  UserRound,
  Eye,
} from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { ownerOverview } from "@/lib/queries/owner";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import { SeverityIcon, SignalBadge, TimeAgo, DemoDataTag, sevTone } from "@/components/common";
import { formatDuration } from "@/lib/i18n";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Onboarding } from "./onboarding";

type Data = Jsonify<Awaited<ReturnType<typeof ownerOverview>>>;

// Literal class names so Tailwind generates them.
const BORDER: Record<string, string> = {
  sev5: "var(--sev-5)",
  sev4: "var(--sev-4)",
  sev3: "var(--sev-3)",
  sev2: "var(--sev-2)",
};
const TEXT: Record<string, string> = {
  sev5: "text-sev-5",
  sev4: "text-sev-4",
  sev3: "text-sev-3",
  sev2: "text-sev-2",
};

export function OwnerView() {
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
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  const d = q.data;
  const items = d?.digest.items ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("owner.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {d?.digest.generatedAt ? (
              <>
                {t("common.lastUpdated", { time: "" })}
                <TimeAgo date={d.digest.generatedAt} />
              </>
            ) : (
              " "
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          data-testid="owner-refresh"
        >
          <RefreshCw className={cn(refresh.isPending && "animate-spin")} /> {t("owner.refresh")}
        </Button>
      </div>

      {d && !d.onboardingDone && !showOnboarding ? (
        <button
          onClick={() => setShowOnboarding(true)}
          className="flex items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary-soft/40 px-4 py-3 text-left"
          data-testid="onboarding-banner"
        >
          <Eye className="size-5 text-primary" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">{t("onb.title")}</span>
            <span className="block text-xs text-muted-foreground">{t("onb.subtitle")}</span>
          </span>
          <ArrowRight className="size-4 text-primary" />
        </button>
      ) : null}
      {showOnboarding ? <Onboarding onClose={() => setShowOnboarding(false)} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          icon={<ListChecks />}
          label={t("owner.kpiOpen")}
          value={d ? String(d.kpis.openTasks) : null}
          testId="kpi-open"
        />
        <Kpi
          icon={<ShieldAlert />}
          label={t("owner.kpiRisk")}
          value={d ? String(d.kpis.atRisk) : null}
          tone={d && d.kpis.atRisk > 0 ? "text-sev-4" : undefined}
          testId="kpi-risk"
        />
        <Kpi
          icon={<Timer />}
          label={t("owner.kpiAck")}
          value={
            d
              ? d.kpis.avgAckMinutes == null
                ? "—"
                : formatDuration(lang, d.kpis.avgAckMinutes)
              : null
          }
          hint={
            d && d.kpis.avgAckMinutes == null
              ? t("owner.kpiAckNone")
              : d
                ? `n = ${d.kpis.ackSample}`
                : undefined
          }
          testId="kpi-ack"
        />
      </div>

      {d?.isDemo ? (
        <div className="-mt-1 flex justify-end">
          <DemoDataTag />
        </div>
      ) : null}

      <section className="flex flex-col gap-3" data-testid="owner-digest">
        {q.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Sun className="size-8 text-sev-3" />
            <p className="text-base font-medium">{t("owner.empty")}</p>
          </Card>
        ) : (
          items.map((it, i) => (
            <Card
              key={it.signalId}
              className="overflow-hidden border-l-4"
              style={{ borderLeftColor: BORDER[sevTone(it.severity)] }}
              data-testid="digest-item"
            >
              <div className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <SignalBadge kind={it.kind} severity={it.severity} />
                  {it.customerName ? <Badge tone="outline">{it.customerName}</Badge> : null}
                </div>
                <h2 className="flex items-start gap-1.5 text-base leading-snug font-semibold">
                  <SeverityIcon
                    severity={it.severity}
                    className={cn("mt-1", TEXT[sevTone(it.severity)])}
                  />
                  {pick(it.title, lang)}
                </h2>
                <p className="text-sm">{pick(it.whatHappened, lang)}</p>
                {pick(it.whyItMatters, lang) ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{t("owner.why")}: </span>
                    {pick(it.whyItMatters, lang)}
                  </p>
                ) : null}
                {it.evidenceQuote ? (
                  <blockquote className="rounded border-l-2 border-border bg-muted/50 px-3 py-1.5 text-[13px] italic">
                    “{it.evidenceQuote}”
                  </blockquote>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserRound className="size-3.5" /> {t("owner.who")}:{" "}
                    <strong className="text-foreground">
                      {it.responsibleName ?? t("common.unassigned")}
                    </strong>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={
                        it.taskId
                          ? `/tasks/${it.taskId}`
                          : `/dispatcher?c=${it.customerId ?? ""}${it.channelId ? `&ch=${it.channelId}` : ""}`
                      }
                      data-testid="digest-open"
                    >
                      {t("common.open")} <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      {d && d.criteria.length ? (
        <section className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5" /> {t("owner.criteria")}:
          {d.criteria.map((c) => (
            <Badge key={c.id} tone="outline">
              {c.text}
            </Badge>
          ))}
          <Link href="/settings#criteria" className="text-primary hover:underline">
            {t("owner.editCriteria")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  hint?: string;
  tone?: string;
  testId: string;
}) {
  return (
    <Card className="flex flex-col gap-1 px-4 py-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      {value === null ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className={cn("text-3xl font-semibold tabular-nums", tone)}>{value}</div>
      )}
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
