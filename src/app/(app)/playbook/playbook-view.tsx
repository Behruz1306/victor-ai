"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, X, Building2, UserRound, MessagesSquare } from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { playbookData } from "@/lib/queries/playbook";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
} from "@/components/ui/primitives";
import { ChatTypeChip, LoadingRows, TimeAgo } from "@/components/common";
import { wordDiff } from "@/lib/diff";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { EditRateChart } from "./edit-rate-chart";

type Data = Jsonify<Awaited<ReturnType<typeof playbookData>>>;
type Rule = Data["rules"][number];

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

export function PlaybookView({ canManage }: { canManage: boolean }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["playbook"],
    queryFn: () => apiGet<Data>("/api/playbook"),
    refetchInterval: POLL_MS * 2,
  });
  if (q.isError)
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  const d = q.data;
  const proposed = d?.rules.filter((r) => r.status === "proposed") ?? [];
  const active = d?.rules.filter((r) => r.status === "active") ?? [];
  const rejected = d?.rules.filter((r) => r.status === "rejected") ?? [];
  const decisions = d ? d.editRate.overall.approved + d.editRate.overall.edited : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("pb.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pb.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("pb.editRate")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("pb.editRateHint")}</p>
        </CardHeader>
        <CardContent>
          {!d ? (
            <LoadingRows rows={2} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[180px_1fr_1fr_1fr]">
              <div className="flex flex-col justify-center" data-testid="pb-edit-rate">
                <div className="text-xs text-muted-foreground">{t("pb.overall")}</div>
                <div className="text-4xl font-semibold tabular-nums">
                  {pct(d.editRate.overall.rate)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {decisions ? t("pb.decisions", { n: decisions }) : t("pb.noDecisions")}
                </div>
              </div>
              <div className="lg:col-span-1">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("pb.chart")}
                </div>
                {decisions ? (
                  <EditRateChart daily={d.editRate.daily} />
                ) : (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    {t("pb.noDecisions")}
                  </p>
                )}
                {decisions ? (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{t("pb.table")}</summary>
                    <table className="mt-1 w-full">
                      <tbody>
                        {d.editRate.daily.map((r) => (
                          <tr key={r.day}>
                            <td>{r.day}</td>
                            <td className="text-right tabular-nums">
                              {r.edited}/{r.approved + r.edited}
                            </td>
                            <td className="text-right tabular-nums">{r.rate ?? "—"}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
              </div>
              <RateTable title={t("pb.byCustomer")} rows={d.editRate.byCustomer} />
              <RateTable title={t("pb.byDispatcher")} rows={d.editRate.byDispatcher} />
            </div>
          )}
        </CardContent>
      </Card>

      {q.isLoading ? (
        <LoadingRows />
      ) : !d?.rules.length ? (
        <Card>
          <EmptyState icon={<BookOpen />} title={t("pb.empty")} />
        </Card>
      ) : (
        <>
          {proposed.length ? (
            <Section title={`${t("pb.status.proposed")} · ${t("pb.scope.company")}`}>
              {proposed.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </Section>
          ) : null}
          {active.length ? (
            <Section title={t("pb.rules")}>
              {active.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </Section>
          ) : null}
          {rejected.length ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("pb.status.rejected")} ({rejected.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2 opacity-70">
                {rejected.map((r) => (
                  <RuleCard key={r.id} rule={r} canManage={false} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="grid gap-2 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function RateTable({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; approved: number; edited: number; rate: number | null }[];
}) {
  const { t } = useT();
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      {rows.length ? (
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{pct(r.rate)}</td>
                <td className="py-1.5 pl-2 text-right text-[11px] text-muted-foreground tabular-nums">
                  n={r.approved + r.edited}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground">{t("pb.noDecisions")}</p>
      )}
    </div>
  );
}

function RuleCard({ rule, canManage }: { rule: Rule; canManage: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const act = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      await apiPost(`/api/rules/${rule.id}`, { action });
      await qc.invalidateQueries({ queryKey: ["playbook"] });
    } finally {
      setBusy(false);
    }
  };
  const ScopeIcon =
    rule.scope === "company" ? Building2 : rule.scope === "customer" ? UserRound : MessagesSquare;
  return (
    <Card
      className={cn("flex flex-col gap-2 p-3", rule.status === "proposed" && "border-sev-3/50")}
      data-testid="rule-card"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          tone={rule.status === "active" ? "ok" : rule.status === "proposed" ? "sev3" : "neutral"}
        >
          {t(`pb.status.${rule.status}` as TKey)}
        </Badge>
        <Badge tone="outline">
          <ScopeIcon /> {t(`pb.scope.${rule.scope}` as TKey)}
          {rule.customerName ? `: ${rule.customerName}` : ""}
        </Badge>
        {rule.chatType ? <ChatTypeChip type={rule.chatType} /> : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {t("pb.hits", { n: rule.hits })}
        </span>
      </div>
      <p className="text-sm font-medium">{rule.text}</p>
      {rule.sources.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("pb.sourceEdits")}: {rule.sources.length}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {rule.sources.map((s) => (
              <div key={s.id} className="rounded-md border bg-muted/40 p-2">
                <div className="mb-1 text-[11px] text-muted-foreground">
                  {s.channelTitle} · {s.decidedBy ?? "—"} ·{" "}
                  {s.decidedAt ? <TimeAgo date={s.decidedAt} /> : null}
                </div>
                <p className="leading-relaxed">
                  {wordDiff(s.proposed, s.final ?? s.proposed).map((p, i) => (
                    <span
                      key={i}
                      className={cn(
                        p.type === "add" && "rounded-sm bg-ok-soft text-ok",
                        p.type === "del" && "rounded-sm bg-sev-5-soft text-sev-5 line-through",
                      )}
                    >
                      {p.text}
                    </span>
                  ))}
                </p>
                {s.reason ? (
                  <p className="mt-1">
                    <span className="font-semibold">{t("pb.reason")}:</span> {s.reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {canManage && rule.status !== "rejected" ? (
        <div className="flex justify-end gap-2">
          {rule.status === "proposed" ? (
            <Button
              size="xs"
              onClick={() => act("approve")}
              disabled={busy}
              data-testid="rule-approve"
            >
              <Check /> {t("pb.approve")}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => act("reject")} disabled={busy}>
            <X /> {t("pb.reject")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
