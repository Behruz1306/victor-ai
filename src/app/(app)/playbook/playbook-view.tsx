"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Building2, UserRound, MessagesSquare, Quote } from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { playbookData } from "@/lib/queries/playbook";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, PageHeader, SectionLabel } from "@/components/ui/primitives";
import { Avatar, ChatTypeChip, TimeAgo } from "@/components/common";
import { EmptyState } from "@/components/empty-state";
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
      <div className="p-6">
        <ErrorState
          message={t("common.error")}
          onRetry={() => q.refetch()}
          retryLabel={t("common.retry")}
        />
      </div>
    );
  const d = q.data;
  const rules = d?.rules ?? [];
  const proposed = rules.filter((r) => r.status === "proposed");
  const live = rules.filter((r) => r.status === "active");
  const rejected = rules.filter((r) => r.status === "rejected");
  const byCustomer = new Map<string, Rule[]>();
  for (const r of live.filter((x) => x.scope === "customer")) {
    const k = r.customerName ?? "—";
    byCustomer.set(k, [...(byCustomer.get(k) ?? []), r]);
  }
  const chatType = live.filter((r) => r.scope === "chat_type");
  const company = live.filter((r) => r.scope === "company");
  const decisions = d ? d.editRate.overall.approved + d.editRate.overall.edited : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("pb.title")} context={t("pb.subtitle")} className="mb-0" />

      <section
        className="grid gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-[220px_minmax(0,1fr)_260px]"
        aria-label={t("pb.editRate")}
      >
        <div
          className="flex flex-col justify-between gap-4 bg-surface p-5"
          data-testid="pb-edit-rate"
        >
          <div>
            <div className="text-sm font-medium text-fg-2">{t("pb.editRate")}</div>
            <div className="num mt-2 text-3xl font-semibold text-fg">
              {d ? pct(d.editRate.overall.rate) : "—"}
            </div>
            <div className="mt-1 text-xs text-fg-3">
              {decisions ? t("pb.decisions", { n: decisions }) : t("pb.noDecisions")}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-fg-3">{t("pb.editRateHint")}</p>
        </div>
        <div className="bg-surface p-5">
          <div className="mb-2 text-sm font-medium text-fg-2">{t("pb.chart")}</div>
          {decisions ? (
            <EditRateChart daily={d!.editRate.daily} />
          ) : (
            <EmptyState
              illustration="chart"
              title={t("pb.noDecisions")}
              hint={t("pb.chartEmpty")}
              className="py-6"
            />
          )}
        </div>
        <div className="flex flex-col gap-5 bg-surface p-5">
          <RateList title={t("pb.byCustomer")} rows={d?.editRate.byCustomer ?? []} />
          <RateList title={t("pb.byDispatcher")} rows={d?.editRate.byDispatcher ?? []} />
        </div>
      </section>

      {q.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-40 rounded-lg" />
          ))}
        </div>
      ) : !rules.length ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState illustration="rules" title={t("pb.emptyTitle")} hint={t("pb.empty")} />
        </div>
      ) : (
        <>
          {proposed.length ? (
            <RuleGroup
              icon={<Building2 />}
              title={t("pb.needsApproval")}
              note={t("pb.needsApprovalHint")}
            >
              {proposed.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </RuleGroup>
          ) : null}
          {[...byCustomer.entries()].map(([name, list]) => (
            <RuleGroup key={name} icon={<UserRound />} title={t("pb.forCustomer", { name })}>
              {list.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </RuleGroup>
          ))}
          {chatType.length ? (
            <RuleGroup icon={<MessagesSquare />} title={t("pb.forChatType")}>
              {chatType.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </RuleGroup>
          ) : null}
          {company.length ? (
            <RuleGroup icon={<Building2 />} title={t("pb.forCompany")}>
              {company.map((r) => (
                <RuleCard key={r.id} rule={r} canManage={canManage} />
              ))}
            </RuleGroup>
          ) : null}
          {rejected.length ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-fg-3 hover:text-fg-2">
                {t("pb.status.rejected")} <span className="num">({rejected.length})</span>
              </summary>
              <div className="mt-3 grid gap-3 opacity-70 lg:grid-cols-2">
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

function RuleGroup({
  icon,
  title,
  note,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1 text-fg-2 [&_svg]:size-4 [&_svg]:text-fg-3">
        {icon}
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {note ? <span className="text-sm text-fg-3">· {note}</span> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function RateList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; approved: number; edited: number; rate: number | null }[];
}) {
  const { t } = useT();
  return (
    <div>
      <SectionLabel className="mb-2 px-0">{title}</SectionLabel>
      {rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <Avatar name={r.name} size={20} />
              <span className="min-w-0 flex-1 truncate text-fg">{r.name}</span>
              <span className="num font-mono font-medium text-fg">{pct(r.rate)}</span>
              <span className="num w-10 text-right font-mono text-xs text-fg-3">
                n={r.approved + r.edited}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">{t("pb.noDecisions")}</p>
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
  const source = rule.sources[0];
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-surface p-4",
        rule.status === "proposed" && "border-medium-border",
      )}
      data-testid="rule-card"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {rule.status === "active" ? (
          <Badge tone="ok">
            <Check /> {t("pb.status.active")}
          </Badge>
        ) : rule.status === "proposed" ? (
          <Badge tone="medium">{t("pb.status.proposed")}</Badge>
        ) : (
          <Badge tone="neutral">{t("pb.status.rejected")}</Badge>
        )}
        <Badge tone="outline">{t(`pb.scope.${rule.scope}` as TKey)}</Badge>
        {rule.chatType ? <ChatTypeChip type={rule.chatType} /> : null}
        <span className="num ml-auto font-mono text-xs text-fg-3" title={t("pb.hitsHint")}>
          {t("pb.hits", { n: rule.hits })}
        </span>
      </div>
      <p className="text-lg leading-snug font-medium text-fg">{rule.text}</p>

      {source ? (
        <div className="flex flex-col gap-2 rounded-md border bg-bg p-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-3">
            <span className="font-medium text-fg-2">{t("pb.learnedFrom")}</span>
            <span>· {source.channelTitle}</span>
            {source.decidedBy ? <span>· {source.decidedBy}</span> : null}
            {source.decidedAt ? (
              <span>
                · <TimeAgo date={source.decidedAt} />
              </span>
            ) : null}
          </div>
          <Diff before={source.proposed} after={source.final ?? source.proposed} />
          {source.reason ? (
            <p className="flex items-start gap-1.5 text-sm text-fg-2">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
              <span>
                <span className="font-medium text-fg">{t("pb.reason")}:</span> {source.reason}
              </span>
            </p>
          ) : null}
          {rule.sources.length > 1 ? (
            <p className="text-xs text-fg-3">{t("pb.moreEdits", { n: rule.sources.length - 1 })}</p>
          ) : null}
        </div>
      ) : null}

      {canManage && rule.status !== "rejected" ? (
        <div className="flex justify-end gap-2">
          {rule.status === "proposed" ? (
            <Button
              size="sm"
              onClick={() => act("approve")}
              disabled={busy}
              data-testid="rule-approve"
            >
              <Check /> {t("pb.approve")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => act("reject")} disabled={busy}>
            <X /> {t("pb.reject")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** Before / after of the edit the rule came from, word-level. */
function Diff({ before, after }: { before: string; after: string }) {
  const { t } = useT();
  const parts = wordDiff(before, after);
  return (
    <div className="grid gap-1.5 text-sm leading-relaxed">
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
        <span className="pt-0.5 text-xs font-medium text-fg-3">{t("pb.before")}</span>
        <p className="text-fg-2">
          {parts
            .filter((p) => p.type !== "add")
            .map((p, i) => (
              <span
                key={i}
                className={cn(
                  p.type === "del" &&
                    "rounded-sm bg-critical-soft px-0.5 text-critical line-through decoration-critical/60",
                )}
              >
                {p.text}
              </span>
            ))}
        </p>
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
        <span className="pt-0.5 text-xs font-medium text-fg-3">{t("pb.after")}</span>
        <p className="text-fg">
          {parts
            .filter((p) => p.type !== "del")
            .map((p, i) => (
              <span
                key={i}
                className={cn(
                  p.type === "add" && "rounded-sm bg-ok-soft px-0.5 font-medium text-ok",
                )}
              >
                {p.text}
              </span>
            ))}
        </p>
      </div>
    </div>
  );
}
