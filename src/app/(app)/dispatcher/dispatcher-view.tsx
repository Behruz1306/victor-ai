"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Gauge, Siren, CheckCircle2, BookOpenCheck } from "lucide-react";
import { apiGet, POLL_MS } from "@/lib/client/api";
import { useT } from "@/components/providers";
import { Badge, Card, EmptyState, ErrorState, Select } from "@/components/ui/primitives";
import { LoadingRows, SignalBadge } from "@/components/common";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChatList } from "./chat-list";
import { Timeline } from "./timeline";
import { SuggestionCard, type ActionResult } from "./suggestion-card";
import { TaskList } from "./task-list";
import type { Detail, Overview } from "./types";

type Toast = { kind: "ok" | "rule"; text: string; sub?: string };

export function DispatcherView({
  initialCustomer,
  initialChannel,
  dispatchers,
  canViewOthers,
  provider,
}: {
  initialCustomer: string | null;
  initialChannel: string | null;
  dispatchers: { id: string; name: string }[];
  canViewOthers: boolean;
  provider: string;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [asUser, setAsUser] = React.useState<string>("");
  const [customerId, setCustomerId] = React.useState<string | null>(initialCustomer);
  const [channelId, setChannelId] = React.useState<string | null>(initialChannel);
  const [toast, setToast] = React.useState<Toast | null>(null);

  const overview = useQuery({
    queryKey: ["dispatcher", asUser],
    queryFn: () => apiGet<Overview>(`/api/dispatcher${asUser ? `?as=${asUser}` : ""}`),
    refetchInterval: POLL_MS,
  });
  const customers = React.useMemo(() => overview.data?.customers ?? [], [overview.data]);
  React.useEffect(() => {
    if (!customers.length) return;
    if (!customerId || !customers.some((c) => c.id === customerId)) {
      setCustomerId(customers[0]!.id);
      setChannelId(customers[0]!.channels[0]?.id ?? null);
    }
  }, [customers, customerId]);

  const detail = useQuery({
    queryKey: ["dispatcher-customer", customerId],
    queryFn: () => apiGet<Detail>(`/api/dispatcher/customers/${customerId}`),
    enabled: Boolean(customerId),
    refetchInterval: POLL_MS,
  });

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const select = (cid: string, chid: string | null) => {
    setCustomerId(cid);
    setChannelId(chid);
    const url = new URL(window.location.href);
    url.searchParams.set("c", cid);
    if (chid) url.searchParams.set("ch", chid);
    else url.searchParams.delete("ch");
    window.history.replaceState(null, "", url.toString());
  };

  const onDone = (kind: "approve" | "edit" | "dismiss", res?: ActionResult) => {
    if (kind === "edit" && res?.rule) {
      setToast({
        kind: "rule",
        text: t("disp.ruleLearned", { customer: res.rule.customerName ?? "" }),
        sub: res.rule.ruleText,
      });
    } else if (kind === "edit") {
      setToast({ kind: "ok", text: t("disp.noRuleLearned") });
    } else if (res) {
      setToast({
        kind: "ok",
        text:
          res.mode === "copy"
            ? t("disp.copied")
            : res.mode === "bot"
              ? t("disp.queued")
              : t("disp.sent"),
      });
    }
    void qc.invalidateQueries({ queryKey: ["dispatcher"] });
    void qc.invalidateQueries({ queryKey: ["dispatcher-customer"] });
  };

  const stats = overview.data?.stats;
  const d = detail.data;
  // Suggestions for the focused chat first.
  const suggestions = d
    ? [...d.suggestions].sort(
        (a, b) => Number(b.channelId === channelId) - Number(a.channelId === channelId),
      )
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {asUser || !canViewOthers ? t("disp.title") : t("disp.titleAll")}
        </h1>
        {canViewOthers ? (
          <Select
            className="h-8 w-auto text-xs"
            value={asUser}
            onChange={(e) => setAsUser(e.target.value)}
            aria-label={t("disp.viewAs")}
          >
            <option value="">{t("disp.titleAll")}</option>
            {dispatchers.map((u) => (
              <option key={u.id} value={u.id}>
                {t("disp.viewAs")}: {u.name}
              </option>
            ))}
          </Select>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span
            className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1"
            data-testid="edit-rate"
          >
            <Gauge className="size-3.5 text-muted-foreground" />
            {t("disp.editRate")}:{" "}
            <strong className="tabular-nums">
              {stats?.editRate.rate == null
                ? t("disp.editRateNone")
                : `${Math.round(stats.editRate.rate * 100)}%`}
            </strong>
            {stats && stats.editRate.approved + stats.editRate.edited > 0 ? (
              <span className="text-muted-foreground">
                ({t("pb.decisions", { n: stats.editRate.approved + stats.editRate.edited })})
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1">
            <Siren className="size-3.5 text-sev-4" />
            {t("disp.urgent")}: <strong className="tabular-nums">{stats?.urgent ?? "—"}</strong>
          </span>
          <Badge tone="outline">
            {t("disp.provider")}: {provider}
          </Badge>
        </div>
      </div>

      {overview.isError ? (
        <ErrorState
          message={t("common.error")}
          onRetry={() => overview.refetch()}
          retryLabel={t("common.retry")}
        />
      ) : null}

      <div className="grid gap-3 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_400px]">
        <div className="min-h-0 overflow-y-auto pr-0.5">
          {overview.isLoading ? (
            <LoadingRows rows={6} />
          ) : customers.length === 0 ? (
            <Card>
              <EmptyState icon={<Inbox />} title={t("disp.noChats")} />
            </Card>
          ) : (
            <ChatList
              customers={customers}
              selectedCustomer={customerId}
              selectedChannel={channelId}
              onSelect={select}
            />
          )}
        </div>

        <Card className="flex min-h-[50vh] flex-col overflow-hidden lg:min-h-0">
          {!customerId ? (
            <EmptyState icon={<Inbox />} title={t("disp.selectCustomer")} />
          ) : detail.isLoading ? (
            <LoadingRows rows={10} />
          ) : detail.isError || !d ? (
            <ErrorState message={t("common.error")} onRetry={() => detail.refetch()} />
          ) : (
            <Timeline detail={d} focusChannel={channelId} />
          )}
        </Card>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:col-span-2 xl:col-span-1">
          {d ? (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("disp.suggestion")}
                </h2>
                {suggestions.length ? (
                  suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      s={s}
                      timezone={d.timezone}
                      sendMode={d.sendMode}
                      onDone={onDone}
                    />
                  ))
                ) : (
                  <Card>
                    <EmptyState
                      icon={<CheckCircle2 />}
                      title={t("disp.noSuggestion")}
                      className="py-6"
                    />
                  </Card>
                )}
              </section>
              {d.signals.length ? (
                <section className="flex flex-col gap-2">
                  <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("disp.signals")}
                  </h2>
                  <Card className="divide-y">
                    {d.signals.map((s) => (
                      <div key={s.id} className="flex flex-col gap-1 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <SignalBadge kind={s.kind} severity={s.severity} />
                          <span className="truncate text-xs font-medium">
                            {pick(s.title, lang)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{pick(s.reason, lang)}</p>
                      </div>
                    ))}
                  </Card>
                </section>
              ) : null}
              <section className="flex flex-col gap-2">
                <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("disp.openTasks")}
                </h2>
                <TaskList tasks={d.tasks} timezone={d.timezone} />
              </section>
            </>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg",
            toast.kind === "rule" ? "border-ok/40 bg-ok-soft text-ok" : "bg-card",
          )}
          data-testid="toast"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            {toast.kind === "rule" ? (
              <BookOpenCheck className="size-4" />
            ) : (
              <CheckCircle2 className="size-4 text-ok" />
            )}
            {toast.text}
          </div>
          {toast.sub ? <p className="mt-1 text-xs">“{toast.sub}”</p> : null}
        </div>
      ) : null}
    </div>
  );
}
