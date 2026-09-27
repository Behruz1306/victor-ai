"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpenCheck, CheckCircle2, Gauge, Siren, Sparkles, ChevronRight } from "lucide-react";
import { apiGet, POLL_MS } from "@/lib/client/api";
import { useT } from "@/components/providers";
import { ErrorState, Kbd, SectionLabel, Select } from "@/components/ui/primitives";
import { AnimatedNumber, LoadingRows, SignalBadge, ChatTypeIcon } from "@/components/common";
import { EmptyState } from "@/components/empty-state";
import {
  SuggestionCard,
  type ActionResult,
  type SuggestionHandle,
} from "@/components/suggestion-card";
import { LearningFlight, type Flight } from "@/components/learning-flight";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { ChatList } from "./chat-list";
import { Timeline } from "./timeline";
import { TaskList } from "./task-list";
import type { Detail, Overview } from "./types";

/** Ids that appeared since the previous poll (slide in + glow once). Reset per customer. */
function useFresh(ids: string[] | undefined, scope: string) {
  const seen = React.useRef<{ scope: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set());
  const key = ids?.join(",");
  React.useEffect(() => {
    if (!ids) return;
    if (!seen.current || seen.current.scope !== scope) {
      seen.current = { scope, ids: new Set(ids) };
      return;
    }
    const added = ids.filter((id) => !seen.current!.ids.has(id));
    ids.forEach((id) => seen.current!.ids.add(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), 1600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids tracked through `key`
  }, [key, scope]);
  return fresh;
}

export function DispatcherView({
  initialCustomer,
  initialChannel,
  dispatchers,
  canViewOthers,
  provider,
  timezone,
}: {
  initialCustomer: string | null;
  initialChannel: string | null;
  dispatchers: { id: string; name: string }[];
  canViewOthers: boolean;
  provider: string;
  timezone: string;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [asUser, setAsUser] = React.useState<string>("");
  const [customerId, setCustomerId] = React.useState<string | null>(initialCustomer);
  const [channelId, setChannelId] = React.useState<string | null>(initialChannel);
  const [promoted, setPromoted] = React.useState<string | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const firstCard = React.useRef<SuggestionHandle>(null);
  const endFlight = React.useCallback(() => setFlight(null), []);

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
  const d = detail.data?.customer.id === customerId ? detail.data : undefined;

  const freshCustomers = useFresh(
    customers.filter((c) => c.channels.some((ch) => ch.unread > 0)).map((c) => `${c.id}`),
    asUser,
  );
  const freshMessages = useFresh(
    d?.timeline.map((m) => m.id),
    customerId ?? "",
  );
  const freshTasks = useFresh(
    d?.tasks.map((x) => x.id),
    customerId ?? "",
  );
  const freshSuggestions = useFresh(
    d?.suggestions.map((s) => s.id),
    customerId ?? "",
  );

  const select = React.useCallback((cid: string, chid: string | null) => {
    setCustomerId(cid);
    setChannelId(chid);
    setPromoted(null);
    const url = new URL(window.location.href);
    url.searchParams.set("c", cid);
    if (chid) url.searchParams.set("ch", chid);
    else url.searchParams.delete("ch");
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  }, []);

  const onDone = React.useCallback(
    (kind: "approve" | "edit" | "dismiss", res?: ActionResult, from?: DOMRect) => {
      if (kind === "edit" && res?.rule) {
        const title = t("disp.ruleLearned", { customer: res.rule.customerName ?? "" });
        toast.custom(
          () => (
            <div
              data-testid="toast"
              className="flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-xl border border-ok-border bg-surface px-4 py-3 shadow-pop"
            >
              <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              <div className="min-w-0">
                <div className="text-base font-medium text-fg">{title}</div>
                <div className="mt-0.5 text-sm text-fg-2">“{res.rule!.ruleText}”</div>
              </div>
            </div>
          ),
          { duration: 6000 },
        );
        if (from) setFlight({ id: Date.now(), from, title, rule: res.rule.ruleText });
      } else if (kind === "edit") {
        toast.success(t("disp.noRuleLearned"));
      } else if (res) {
        toast.success(
          res.mode === "copy"
            ? t("disp.copied")
            : res.mode === "bot"
              ? t("disp.queued")
              : t("disp.sent"),
        );
      }
      void qc.invalidateQueries({ queryKey: ["dispatcher"] });
      void qc.invalidateQueries({ queryKey: ["dispatcher-customer"] });
    },
    [qc, t],
  );

  // Keyboard: J/K move between customers, A approve, E edit, Esc cancel.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el?.closest("input, textarea, select, [contenteditable=true], [role=dialog]");
      if (e.key === "Escape") {
        firstCard.current?.cancel();
        return;
      }
      if (typing) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        const i = customers.findIndex((c) => c.id === customerId);
        const next =
          customers[Math.max(0, Math.min(customers.length - 1, i + (k === "j" ? 1 : -1)))];
        if (next && next.id !== customerId) {
          e.preventDefault();
          select(next.id, next.channels[0]?.id ?? null);
        }
      } else if (k === "a") {
        e.preventDefault();
        firstCard.current?.approve();
      } else if (k === "e") {
        e.preventDefault();
        firstCard.current?.edit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customers, customerId, select]);

  const stats = overview.data?.stats;
  const decisions = stats ? stats.editRate.approved + stats.editRate.edited : 0;
  const suggestions = d
    ? [...d.suggestions].sort(
        (a, b) =>
          Number(b.id === promoted) - Number(a.id === promoted) ||
          Number(b.channelId === channelId) - Number(a.channelId === channelId),
      )
    : [];
  const [first, ...rest] = suggestions;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col lg:h-screen lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-surface px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-fg">
            {asUser || !canViewOthers ? t("disp.title") : t("disp.titleAll")}
          </h1>
          <p className="text-sm text-fg-3">
            {customers.length ? t("disp.context", { n: customers.length }) : t("disp.contextEmpty")}
          </p>
        </div>
        {canViewOthers ? (
          <Select
            className="h-8 w-auto text-sm"
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
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span
            className="flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-fg-2"
            data-testid="edit-rate"
            title={t("disp.editRateHint")}
          >
            <Gauge className="size-3.5 text-fg-3" aria-hidden />
            {t("disp.editRate")}
            <strong className="font-semibold text-fg">
              {stats?.editRate.rate == null ? (
                t("disp.editRateNone")
              ) : (
                <AnimatedNumber
                  value={stats.editRate.rate * 100}
                  format={(n) => `${Math.round(n)}%`}
                />
              )}
            </strong>
            {decisions ? (
              <span className="num text-xs text-fg-3">· {t("pb.decisions", { n: decisions })}</span>
            ) : null}
          </span>
          <span
            className="flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-fg-2"
            title={t("disp.urgentHint")}
          >
            <Siren
              className={cn("size-3.5", (stats?.urgent ?? 0) > 0 ? "text-high" : "text-fg-3")}
              aria-hidden
            />
            {t("disp.urgent")}
            <strong className="num font-semibold text-fg">{stats?.urgent ?? "—"}</strong>
          </span>
          <span
            className="flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs text-fg-3"
            title={t("disp.providerHint")}
          >
            <Sparkles className="size-3.5" aria-hidden /> AI: {provider}
          </span>
        </div>
      </header>

      {overview.isError ? (
        <div className="p-4">
          <ErrorState
            message={t("common.error")}
            onRetry={() => overview.refetch()}
            retryLabel={t("common.retry")}
          />
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[288px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_360px] 2xl:grid-cols-[320px_minmax(0,1fr)_400px]">
        {/* Left: chats by urgency */}
        <div className="flex min-h-0 flex-col border-b bg-surface lg:border-r lg:border-b-0">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {overview.isLoading ? (
              <LoadingRows rows={6} />
            ) : customers.length === 0 ? (
              <EmptyState
                illustration="chats"
                title={t("disp.noChats")}
                hint={t("disp.noChatsHint")}
              />
            ) : (
              <ChatList
                customers={customers}
                selectedCustomer={customerId}
                selectedChannel={channelId}
                onSelect={select}
                timezone={timezone}
                freshIds={freshCustomers}
              />
            )}
          </div>
          <div className="hidden items-center gap-1.5 border-t px-4 py-2 text-xs text-fg-3 lg:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> {t("disp.kbdMove")}
            <span className="mx-1">·</span>
            <Kbd>A</Kbd> {t("disp.kbdApprove")}
            <span className="mx-1">·</span>
            <Kbd>E</Kbd> {t("disp.kbdEdit")}
          </div>
        </div>

        {/* Center: merged timeline */}
        <section
          className="flex min-h-[60vh] flex-col bg-surface lg:min-h-0"
          aria-label={t("disp.timeline")}
        >
          {!customerId ? (
            <EmptyState illustration="chats" title={t("disp.selectCustomer")} />
          ) : !d ? (
            detail.isError ? (
              <div className="p-4">
                <ErrorState message={t("common.error")} onRetry={() => detail.refetch()} />
              </div>
            ) : (
              <LoadingRows rows={10} />
            )
          ) : (
            <Timeline detail={d} focusChannel={channelId} freshIds={freshMessages} />
          )}
        </section>

        {/* Right: the next message, signals, open tasks */}
        <aside
          className="flex min-h-0 flex-col gap-5 overflow-y-auto border-t bg-bg p-4 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l"
          aria-label={t("disp.suggestion")}
        >
          {d ? (
            <>
              <section className="flex flex-col gap-2">
                <SectionLabel
                  aside={
                    suggestions.length > 1 ? (
                      <span className="num text-xs text-fg-3">{suggestions.length}</span>
                    ) : null
                  }
                >
                  {t("disp.suggestion")}
                </SectionLabel>
                {first ? (
                  <SuggestionCard
                    key={first.id}
                    ref={firstCard}
                    s={first}
                    timezone={d.timezone}
                    sendMode={d.sendMode}
                    fresh={freshSuggestions.has(first.id)}
                    onDone={onDone}
                  />
                ) : (
                  <div className="rounded-lg border bg-surface">
                    <EmptyState
                      illustration="calm"
                      title={t("disp.noSuggestion")}
                      hint={t("disp.noSuggestionHint")}
                      className="py-8"
                    />
                  </div>
                )}
                {rest.length ? (
                  <ul className="flex flex-col overflow-hidden rounded-lg border bg-surface">
                    {rest.map((s) => (
                      <li key={s.id} className="border-b last:border-b-0">
                        <button
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2",
                            freshSuggestions.has(s.id) && "animate-glow",
                          )}
                          onClick={() => setPromoted(s.id)}
                          data-testid="suggestion-more"
                        >
                          <ChatTypeIcon type={s.chatType} className="text-fg-3" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-fg">
                              {t(`intent.${s.intent}` as TKey)} · {s.channelTitle}
                            </span>
                            <span className="block truncate text-xs text-fg-3">{s.text}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              {d.signals.length ? (
                <section className="flex flex-col gap-2">
                  <SectionLabel
                    aside={<span className="num text-xs text-fg-3">{d.signals.length}</span>}
                  >
                    {t("disp.signals")}
                  </SectionLabel>
                  <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
                    {d.signals.map((s) => (
                      <li key={s.id} className="flex flex-col gap-1 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <SignalBadge kind={s.kind} severity={s.severity} />
                          <span className="truncate text-sm font-medium text-fg">
                            {pick(s.title, lang)}
                          </span>
                        </div>
                        <p className="text-sm text-fg-3">{pick(s.reason, lang)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="flex flex-col gap-2">
                <SectionLabel>{t("disp.openTasks")}</SectionLabel>
                <TaskList tasks={d.tasks} timezone={d.timezone} freshIds={freshTasks} />
              </section>
            </>
          ) : overview.isLoading || detail.isLoading ? (
            <div className="flex flex-col gap-3">
              <div className="skeleton h-56 rounded-lg" />
              <div className="skeleton h-24 rounded-lg" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-fg-3">
              <CheckCircle2 className="size-4" aria-hidden /> {t("disp.selectCustomer")}
            </div>
          )}
        </aside>
      </div>
      <LearningFlight flight={flight} onDone={endFlight} />
    </div>
  );
}
