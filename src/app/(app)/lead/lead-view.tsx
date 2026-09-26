"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, UserMinus, Loader2, Users } from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { dispatcherProblems, leadOverview } from "@/lib/queries/lead";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, Select } from "@/components/ui/primitives";
import { LoadingRows, SeverityIcon, SignalBadge, TimeAgo, sevTone } from "@/components/common";
import { formatDuration } from "@/lib/i18n";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = Jsonify<Awaited<ReturnType<typeof leadOverview>>[number]>;
type Problem = Jsonify<Awaited<ReturnType<typeof dispatcherProblems>>[number]>;
const TEXT: Record<string, string> = {
  sev5: "text-sev-5",
  sev4: "text-sev-4",
  sev3: "text-sev-3",
  sev2: "text-sev-2",
};

export function LeadView({
  canHandoff,
  staff,
}: {
  canHandoff: boolean;
  staff: { id: string; name: string; role: string }[];
}) {
  const { t, lang } = useT();
  const q = useQuery({
    queryKey: ["lead"],
    queryFn: () => apiGet<{ rows: Row[] }>("/api/lead"),
    refetchInterval: POLL_MS,
  });
  const [selected, setSelected] = React.useState<string | null>(null);
  const rows = React.useMemo(() => q.data?.rows ?? [], [q.data]);
  const current = rows.find((r) => r.userId === selected) ?? null;
  React.useEffect(() => {
    // Open the dispatcher who needs attention most.
    if (!selected && rows.length) {
      const worst = [...rows].sort((a, b) => b.openUrgent - a.openUrgent || b.worstSeverity - a.worstSeverity)[0]!;
      setSelected(worst.userId);
    }
  }, [rows, selected]);

  if (q.isError)
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">{t("lead.title")}</h1>
      <Card className="overflow-x-auto">
        {q.isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users />} title="—" />
        ) : (
          <table className="w-full min-w-[720px] text-sm" data-testid="lead-table">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("lead.dispatcher")}</th>
                <th className="px-3 py-2 font-medium">{t("lead.customers")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("lead.openUrgent")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("lead.avgFirstResponse")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("lead.overdue")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("lead.tone")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("lead.editRate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr
                  key={r.userId}
                  onClick={() => setSelected(r.userId)}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    selected === r.userId && "bg-primary-soft/50",
                  )}
                  data-testid={`lead-row-${r.name}`}
                >
                  <td className="px-4 py-2.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      {r.worstSeverity >= 3 ? (
                        <SeverityIcon
                          severity={r.worstSeverity}
                          className={TEXT[sevTone(r.worstSeverity)]}
                        />
                      ) : null}
                      {r.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.customers.join(", ") || "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.openUrgent > 0 && "font-semibold text-sev-4",
                    )}
                  >
                    {r.openUrgent}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.avgFirstResponseMin == null
                      ? "—"
                      : formatDuration(lang, r.avgFirstResponseMin)}
                    {r.firstResponseSample ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        n={r.firstResponseSample}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.overdue > 0 && "font-semibold text-sev-5",
                    )}
                  >
                    {r.overdue}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.toneFlags > 0 && "font-semibold text-sev-4",
                    )}
                  >
                    {r.toneFlags}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.editRate.rate == null ? "—" : `${Math.round(r.editRate.rate * 100)}%`}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      n={r.editRate.approved + r.editRate.edited}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {current ? (
        <Problems row={current} canHandoff={canHandoff} staff={staff} lang={lang} />
      ) : rows.length ? (
        <p className="text-sm text-muted-foreground">{t("lead.selectDispatcher")}</p>
      ) : null}
    </div>
  );
}

function Problems({
  row,
  canHandoff,
  staff,
  lang,
}: {
  row: Row;
  canHandoff: boolean;
  staff: { id: string; name: string; role: string }[];
  lang: "en" | "ru";
}) {
  const { t } = useT();
  const router = useRouter();
  const q = useQuery({
    queryKey: ["lead-problems", row.userId],
    queryFn: () => apiGet<{ problems: Problem[] }>(`/api/lead/${row.userId}`),
    refetchInterval: POLL_MS,
  });
  const others = staff.filter((s) => s.id !== row.userId);
  const [to, setTo] = React.useState(others[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t("lead.problems", { name: row.name })}</h2>
        </div>
        {q.isLoading ? (
          <LoadingRows />
        ) : !q.data?.problems.length ? (
          <EmptyState title={t("lead.noProblems")} />
        ) : (
          <ul className="divide-y">
            {q.data.problems.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SignalBadge kind={p.kind} severity={p.severity} />
                    <span className="text-sm font-medium">{pick(p.title, lang)}</span>
                    {p.customerName ? (
                      <span className="text-xs text-muted-foreground">· {p.customerName}</span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      · <TimeAgo date={p.createdAt} />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pick(p.reason, lang)}</p>
                </div>
                <Button asChild variant="ghost" size="xs">
                  <Link
                    href={
                      p.taskId
                        ? `/tasks/${p.taskId}`
                        : `/dispatcher?c=${p.customerId ?? ""}${p.channelId ? `&ch=${p.channelId}` : ""}`
                    }
                  >
                    {t("common.open")} <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canHandoff ? (
        <Card className="flex flex-col gap-2 p-4" data-testid="handoff-panel">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <UserMinus className="size-4" /> {t("lead.handoff")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("handoff.subtitle", { from: row.name })}
          </p>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="handoff-to">
            {t("handoff.to")}
          </label>
          <Select id="handoff-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {t(`role.${s.role}` as "role.owner")}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!to || busy || row.customers.length === 0}
            data-testid="handoff-generate"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await apiPost<{ id: string }>("/api/handoff", {
                  fromUserId: row.userId,
                  toUserId: to,
                });
                router.push(`/lead/handoff/${res.id}`);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? t("handoff.generating") : t("handoff.generate")}
          </Button>
          {row.customers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("handoff.empty")}</p>
          ) : null}
          {error ? <p className="text-xs text-sev-5">{error}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
