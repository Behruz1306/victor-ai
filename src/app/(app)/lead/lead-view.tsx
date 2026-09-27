"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  UserMinus,
  Loader2,
  Check,
} from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { dispatcherProblems, leadOverview } from "@/lib/queries/lead";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { ErrorState, Label, PageHeader, SectionLabel, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import {
  Avatar,
  LoadingRows,
  SeverityIcon,
  SignalBadge,
  TimeAgo,
  severityLevel,
} from "@/components/common";
import { EmptyState } from "@/components/empty-state";
import { formatDuration } from "@/lib/i18n";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

type Row = Jsonify<Awaited<ReturnType<typeof leadOverview>>[number]>;
type Problem = Jsonify<Awaited<ReturnType<typeof dispatcherProblems>>[number]>;
type SortKey = "name" | "openUrgent" | "avgFirstResponseMin" | "overdue" | "toneFlags" | "editRate";

const SEV_TEXT: Record<string, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
};

function sortValue(r: Row, k: SortKey): number | string {
  if (k === "name") return r.name;
  if (k === "editRate") return r.editRate.rate ?? -1;
  if (k === "avgFirstResponseMin") return r.avgFirstResponseMin ?? -1;
  return r[k];
}

export function LeadView({
  canHandoff,
  staff,
  initialUser,
}: {
  canHandoff: boolean;
  staff: { id: string; name: string; role: string }[];
  initialUser: string | null;
}) {
  const { t, lang } = useT();
  const q = useQuery({
    queryKey: ["lead"],
    queryFn: () => apiGet<{ rows: Row[] }>("/api/lead"),
    refetchInterval: POLL_MS,
  });
  const [selected, setSelected] = React.useState<string | null>(initialUser);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "openUrgent",
    dir: -1,
  });
  const rows = React.useMemo(() => {
    const list = [...(q.data?.rows ?? [])];
    return list.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
      return c * sort.dir || a.name.localeCompare(b.name);
    });
  }, [q.data, sort]);
  const current = rows.find((r) => r.userId === selected) ?? null;
  React.useEffect(() => {
    // Open the dispatcher who needs attention most.
    if ((!selected || !rows.some((r) => r.userId === selected)) && rows.length) {
      const worst = [...rows].sort(
        (a, b) => b.openUrgent - a.openUrgent || b.worstSeverity - a.worstSeverity,
      )[0]!;
      setSelected(worst.userId);
    }
  }, [rows, selected]);

  if (q.isError)
    return (
      <div className="p-6">
        <ErrorState
          message={t("common.error")}
          onRetry={() => q.refetch()}
          retryLabel={t("common.retry")}
        />
      </div>
    );

  const Th = ({
    k,
    children,
    right,
  }: {
    k: SortKey;
    children: React.ReactNode;
    right?: boolean;
  }) => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        className={cn(
          "sticky top-0 z-10 border-b bg-surface px-3 py-2.5 font-medium whitespace-nowrap",
          right && "text-right",
        )}
      >
        <button
          onClick={() =>
            setSort((s) => ({
              key: k,
              dir: s.key === k ? (-s.dir as 1 | -1) : k === "name" ? 1 : -1,
            }))
          }
          className={cn(
            "inline-flex items-center gap-1 hover:text-fg",
            active ? "text-fg" : "text-fg-3",
            right && "flex-row-reverse",
          )}
        >
          {children}
          <Icon className="size-3.5" aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("lead.title")} context={t("lead.context")} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="max-h-[calc(100vh-180px)] overflow-auto rounded-lg border bg-surface">
          {q.isLoading ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState illustration="tasks" title={t("lead.noDispatchers")} />
          ) : (
            <table className="w-full min-w-[600px] text-sm" data-testid="lead-table">
              <thead className="text-left text-xs">
                <tr>
                  <Th k="name">{t("lead.dispatcher")}</Th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b bg-surface px-3 py-2.5 font-medium text-fg-3"
                  >
                    {t("lead.customers")}
                  </th>
                  <Th k="openUrgent" right>
                    {t("lead.col.urgent")}
                  </Th>
                  <Th k="avgFirstResponseMin" right>
                    {t("lead.col.firstReply")}
                  </Th>
                  <Th k="overdue" right>
                    {t("lead.col.overdue")}
                  </Th>
                  <Th k="toneFlags" right>
                    {t("lead.col.tone")}
                  </Th>
                  <Th k="editRate" right>
                    {t("lead.col.edits")}
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const level = r.worstSeverity >= 3 ? severityLevel(r.worstSeverity) : null;
                  return (
                    <tr
                      key={r.userId}
                      onClick={() => setSelected(r.userId)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-surface-2",
                        selected === r.userId && "bg-accent-soft/60 hover:bg-accent-soft/80",
                      )}
                      data-testid={`lead-row-${r.name}`}
                      aria-selected={selected === r.userId}
                    >
                      <td className="px-3 py-3">
                        <button
                          className="flex items-center gap-2.5 text-left"
                          onClick={() => setSelected(r.userId)}
                        >
                          <Avatar name={r.name} size={28} />
                          <span className="font-medium text-fg">{r.name}</span>
                          {level ? (
                            <SeverityIcon
                              level={level}
                              className={SEV_TEXT[level]}
                              aria-label={t(`sev.${Math.min(5, r.worstSeverity)}` as TKey)}
                            />
                          ) : null}
                        </button>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-fg-2" title={r.customers.join(", ")}>
                        {r.customers.join(", ") || "—"}
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-3 text-right font-mono",
                          r.openUrgent > 0 ? "font-semibold text-high" : "text-fg-3",
                        )}
                      >
                        {r.openUrgent}
                      </td>
                      <td className="num px-3 py-3 text-right font-mono text-fg">
                        {r.avgFirstResponseMin == null
                          ? "—"
                          : formatDuration(lang, r.avgFirstResponseMin)}
                        {r.firstResponseSample ? (
                          <span className="ml-1 text-xs text-fg-3">n={r.firstResponseSample}</span>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-3 text-right font-mono",
                          r.overdue > 0 ? "font-semibold text-critical" : "text-fg-3",
                        )}
                      >
                        {r.overdue}
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-3 text-right font-mono",
                          r.toneFlags > 0 ? "font-semibold text-high" : "text-fg-3",
                        )}
                      >
                        {r.toneFlags}
                      </td>
                      <td className="num px-3 py-3 text-right font-mono text-fg">
                        {r.editRate.rate == null ? "—" : `${Math.round(r.editRate.rate * 100)}%`}
                        <span className="ml-1 text-xs text-fg-3">
                          n={r.editRate.approved + r.editRate.edited}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {current ? <SidePanel row={current} canHandoff={canHandoff} staff={staff} /> : null}
      </div>
    </div>
  );
}

function SidePanel({
  row,
  canHandoff,
  staff,
}: {
  row: Row;
  canHandoff: boolean;
  staff: { id: string; name: string; role: string }[];
}) {
  const { t, lang } = useT();
  const q = useQuery({
    queryKey: ["lead-problems", row.userId],
    queryFn: () => apiGet<{ problems: Problem[] }>(`/api/lead/${row.userId}`),
    refetchInterval: POLL_MS,
  });
  const [open, setOpen] = React.useState(false);
  return (
    <aside
      className="flex flex-col gap-4 xl:sticky xl:top-6"
      aria-label={t("lead.problems", { name: row.name })}
    >
      <div className="flex items-center gap-3 rounded-lg border bg-surface p-4">
        <Avatar name={row.name} size={40} />
        <div className="min-w-0">
          <div className="text-lg font-semibold text-fg">{row.name}</div>
          <div className="truncate text-sm text-fg-3">
            {row.customers.join(", ") || t("lead.noCustomers")}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabel
          aside={
            q.data ? <span className="num text-xs text-fg-3">{q.data.problems.length}</span> : null
          }
        >
          {t("lead.problemsShort")}
        </SectionLabel>
        <div className="overflow-hidden rounded-lg border bg-surface">
          {q.isLoading ? (
            <LoadingRows rows={3} />
          ) : !q.data?.problems.length ? (
            <EmptyState illustration="calm" title={t("lead.noProblems")} className="py-8" />
          ) : (
            <ul className="divide-y" data-testid="lead-problems">
              {q.data.problems.map((p) => (
                <li key={p.id}>
                  <Link
                    href={
                      p.taskId
                        ? `/tasks/${p.taskId}`
                        : `/dispatcher?c=${p.customerId ?? ""}${p.channelId ? `&ch=${p.channelId}` : ""}`
                    }
                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SignalBadge kind={p.kind} severity={p.severity} />
                        {p.customerName ? (
                          <span className="text-xs text-fg-3">{p.customerName}</span>
                        ) : null}
                        <span className="text-xs text-fg-3">
                          · <TimeAgo date={p.createdAt} />
                        </span>
                      </div>
                      <span className="text-sm font-medium text-fg">{pick(p.title, lang)}</span>
                      <p className="text-sm text-fg-3">{pick(p.reason, lang)}</p>
                    </div>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {canHandoff ? (
        <section
          className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
          data-testid="handoff-panel"
        >
          <div className="flex items-center gap-2">
            <UserMinus className="size-4 text-fg-3" aria-hidden />
            <h3 className="text-base font-semibold text-fg">{t("lead.handoff")}</h3>
          </div>
          <p className="text-sm text-fg-3">{t("handoff.subtitle", { from: row.name })}</p>
          <Button
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={row.customers.length === 0}
            data-testid="handoff-open"
          >
            {t("handoff.start", { name: row.name })} <ArrowRight />
          </Button>
          {row.customers.length === 0 ? (
            <p className="text-sm text-fg-3">{t("handoff.empty")}</p>
          ) : null}
          <HandoffDialog
            open={open}
            onOpenChange={setOpen}
            row={row}
            staff={staff}
            openProblems={q.data?.problems.length ?? 0}
          />
        </section>
      ) : null}
    </aside>
  );
}

/** Two steps: who takes over (and what moves), then build the brief. */
function HandoffDialog({
  open,
  onOpenChange,
  row,
  staff,
  openProblems,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: Row;
  staff: { id: string; name: string; role: string }[];
  openProblems: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const others = staff.filter((s) => s.id !== row.userId);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [to, setTo] = React.useState(others[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
    }
  }, [open]);
  const toName = others.find((o) => o.id === to)?.name ?? "";
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={t("handoff.dialogTitle", { name: row.name })}
        description={t("handoff.stepOf", { n: step })}
      >
        <div className="flex flex-col gap-5 p-5">
          <ol className="flex items-center gap-2 text-xs" aria-hidden>
            {[1, 2].map((n) => (
              <li key={n} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border font-semibold",
                    step > n
                      ? "border-accent bg-accent text-accent-fg"
                      : step === n
                        ? "border-accent text-accent-text"
                        : "border-border-strong text-fg-3",
                  )}
                >
                  {step > n ? <Check className="size-3" /> : n}
                </span>
                <span className={cn(step >= n ? "text-fg" : "text-fg-3")}>
                  {t(n === 1 ? "handoff.step1" : "handoff.step2")}
                </span>
                {n === 1 ? <span className="h-px flex-1 bg-border" /> : null}
              </li>
            ))}
          </ol>

          {step === 1 ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="handoff-to">{t("handoff.to")}</Label>
                <Select id="handoff-to" value={to} onChange={(e) => setTo(e.target.value)}>
                  {others.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {t(`role.${s.role}` as TKey)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="rounded-md border bg-bg p-3 text-sm">
                <div className="mb-2 font-medium text-fg">{t("handoff.moves")}</div>
                <ul className="flex flex-col gap-1 text-fg-2">
                  {row.customers.map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <Avatar name={c} size={20} /> {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-fg-3">
                  {t("handoff.movesNote", { n: openProblems })}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => setStep(2)} disabled={!to} data-testid="handoff-next">
                  {t("onb.next")} <ArrowRight />
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-base text-fg">
                {t("handoff.confirmText", { from: row.name, to: toName })}
              </p>
              <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
                <li>· {t("handoff.brief1")}</li>
                <li>· {t("handoff.brief2")}</li>
                <li>· {t("handoff.brief3")}</li>
              </ul>
              {error ? (
                <p role="alert" className="text-sm text-critical">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                  {t("common.back")}
                </Button>
                <Button
                  disabled={busy}
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
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
