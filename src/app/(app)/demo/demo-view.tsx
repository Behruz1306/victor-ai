"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RotateCcw,
  Download,
  Play,
  Square,
  Timer,
  FileText,
  Loader2,
  CircleCheck,
  TriangleAlert,
  CircleX,
  WifiOff,
  Wifi,
} from "lucide-react";
import { apiGet, apiPost, type Jsonify } from "@/lib/client/api";
import type { demoFreshness, demoStatus } from "@/lib/demo/control";
import type { llmOverview } from "@/lib/queries/llm-status";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { ErrorState, PageHeader, SectionLabel } from "@/components/ui/primitives";
import { LiveDot, TimeAgo } from "@/components/common";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Status = Jsonify<Awaited<ReturnType<typeof demoStatus>>> & {
  system: {
    workerAlive: boolean;
    workerLastSeen: string | null;
    telegram: {
      configured: boolean;
      placeholder: boolean;
      username: string | null;
      online: boolean;
      lastUpdateAt: string | null;
    };
  };
  ai: Jsonify<Awaited<ReturnType<typeof llmOverview>>>;
  freshness: Jsonify<Awaited<ReturnType<typeof demoFreshness>>>;
};
type Action =
  | "reset"
  | "load"
  | "replay_start"
  | "replay_stop"
  | "sla"
  | "digest"
  | "offline_on"
  | "offline_off";

const LABEL: Record<Action, TKey> = {
  reset: "demo.reset",
  load: "demo.load",
  replay_start: "demo.startReplay",
  replay_stop: "demo.stopReplay",
  sla: "demo.runSla",
  digest: "demo.digest",
  offline_on: "demo.offlineOn",
  offline_off: "demo.offlineOff",
};

export function DemoView() {
  const { t } = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["demo"],
    queryFn: () => apiGet<Status>("/api/demo"),
    refetchInterval: 2000,
  });
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: Action) => {
    setBusy(action);
    setMessage(null);
    try {
      await apiPost("/api/demo", { action });
      setMessage({ ok: true, text: `${t(LABEL[action])}: ${t("demo.ok")}` });
      await qc.invalidateQueries();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

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
  const s = q.data;
  const replaying = (s?.replayLeft ?? 0) > 0;
  const offline = s?.ai.mode === "offline" || s?.ai.forcedMock;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("demo.title")} context={t("demo.subtitle")} className="mb-0" />

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "-mt-4 min-h-6 text-sm",
          message ? (message.ok ? "text-ok" : "text-critical") : "text-transparent",
        )}
      >
        {message?.text ?? "·"}
      </p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("demo.scenario")}>
        <BigAction
          n={1}
          icon={<RotateCcw />}
          title={t("demo.reset")}
          hint={t("demo.resetHint")}
          onClick={() => run("reset")}
          busy={busy === "reset"}
          disabled={Boolean(busy)}
          testId="demo-reset"
        />
        <BigAction
          n={2}
          icon={<Download />}
          title={t("demo.load")}
          hint={t("demo.loadHint")}
          onClick={() => run("load")}
          busy={busy === "load"}
          disabled={Boolean(busy)}
          testId="demo-load"
          primary
        />
        {replaying ? (
          <BigAction
            n={3}
            icon={<Square />}
            title={t("demo.stopReplay")}
            hint={`${t("demo.replayLeft")}: ${s?.replayLeft}/${s?.replayTotal}`}
            onClick={() => run("replay_stop")}
            busy={busy === "replay_stop"}
            disabled={Boolean(busy)}
            testId="demo-replay-stop"
            live
          />
        ) : (
          <BigAction
            n={3}
            icon={<Play />}
            title={t("demo.startReplay")}
            hint={t("demo.replayHint")}
            onClick={() => run("replay_start")}
            busy={busy === "replay_start"}
            disabled={Boolean(busy)}
            testId="demo-replay-start"
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3" aria-label={t("demo.checklist")}>
          <SectionLabel>{t("demo.checklist")}</SectionLabel>
          <ul
            className="divide-y overflow-hidden rounded-lg border bg-surface"
            data-testid="presenter-checklist"
          >
            <Check
              state={!s ? "wait" : s.ai.active.id !== "mock" ? "ok" : offline ? "warn" : "fail"}
              title={t("demo.ckKeys")}
              detail={
                s
                  ? offline
                    ? t("demo.ckKeysOffline")
                    : s.ai.active.id === "mock"
                      ? t("demo.ckKeysMissing")
                      : `${s.ai.active.label} · ${s.ai.active.model}`
                  : "…"
              }
              extra={s?.ai.warnings.length ? s.ai.warnings.join(" · ") : undefined}
            />
            <Check
              state={
                !s
                  ? "wait"
                  : s.system.telegram.online
                    ? "ok"
                    : s.system.telegram.configured
                      ? "fail"
                      : "warn"
              }
              title={t("demo.ckBot")}
              detail={
                s
                  ? s.system.telegram.online
                    ? `@${s.system.telegram.username} · ${s.system.telegram.lastUpdateAt ? t("demo.ckBotLast") : t("set.botNoUpdates")}`
                    : s.system.telegram.placeholder
                      ? t("demo.ckBotPlaceholder")
                      : s.system.telegram.configured
                        ? t("demo.ckBotDown")
                        : t("demo.ckBotNone")
                  : "…"
              }
              time={s?.system.telegram.online ? s.system.telegram.lastUpdateAt : null}
            />
            <Check
              state={
                !s
                  ? "wait"
                  : s.freshness.fresh
                    ? "ok"
                    : s.freshness.ageHours === null
                      ? "fail"
                      : "warn"
              }
              title={t("demo.ckFresh")}
              detail={
                s
                  ? s.freshness.ageHours === null
                    ? t("demo.ckFreshNone")
                    : t("demo.ckFreshAge", { h: Math.round(s.freshness.ageHours * 10) / 10 })
                  : "…"
              }
            />
            <Check
              state={
                !s ? "wait" : !s.freshness.lastRun ? "warn" : s.freshness.lastRun.ok ? "ok" : "fail"
              }
              title={t("demo.ckRun")}
              detail={
                s?.freshness.lastRun
                  ? `${s.freshness.lastRun.provider}/${s.freshness.lastRun.model}${s.freshness.lastRun.cached ? ` · ${t("demo.cached")}` : ` · ${(s.freshness.lastRun.latencyMs / 1000).toFixed(1)} s`}`
                  : t("demo.ckRunNone")
              }
              time={s?.freshness.lastRun?.at ?? null}
            />
            <Check
              state={!s ? "wait" : s.system.workerAlive ? "ok" : "fail"}
              title={t("demo.ckWorker")}
              detail={
                s ? (s.system.workerAlive ? t("demo.ckWorkerOk") : t("demo.workerHint")) : "…"
              }
              time={s?.system.workerLastSeen ?? null}
            />
          </ul>
        </section>

        <section className="flex flex-col gap-3" aria-label={t("demo.queue")}>
          <SectionLabel>{t("demo.queue")}</SectionLabel>
          <div
            className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border bg-border text-center"
            data-testid="demo-queue"
          >
            <Num label={t("demo.pending")} value={s?.queue.pending} />
            <Num label={t("demo.running")} value={s?.queue.running} />
            <Num
              label={t("demo.failed")}
              value={s?.queue.failed}
              tone={s && s.queue.failed ? "critical" : undefined}
            />
            <Num label={t("demo.done")} value={s?.queue.done} />
            <Num label={t("demo.messages")} value={s?.counts.messages} />
            <Num label={t("demo.tasks")} value={s?.counts.tasks} />
            <Num label={t("demo.signals")} value={s?.counts.signals} />
            <Num label={t("demo.suggestions")} value={s?.counts.suggestions} />
          </div>

          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4",
              offline ? "border-medium-border bg-medium-soft/50" : "bg-surface",
            )}
          >
            <span className={cn("mt-0.5", offline ? "text-medium" : "text-fg-3")}>
              {offline ? (
                <WifiOff className="size-5" aria-hidden />
              ) : (
                <Wifi className="size-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium text-fg">{t("demo.offlineTitle")}</div>
              <p className="text-sm text-fg-3">
                {offline ? t("demo.offlineOnHint") : t("demo.offlineOffHint")}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={Boolean(offline)}
              aria-label={t("demo.offlineTitle")}
              disabled={Boolean(busy) || s?.ai.forcedMock}
              onClick={() => run(offline ? "offline_off" : "offline_on")}
              data-testid="offline-switch"
              className={cn(
                "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                offline ? "bg-medium" : "bg-surface-3",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform duration-[160ms]",
                  offline && "translate-x-5",
                )}
              />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => run("sla")}
              disabled={Boolean(busy)}
              data-testid="demo-sla"
            >
              {busy === "sla" ? <Loader2 className="animate-spin" /> : <Timer />} {t("demo.runSla")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => run("digest")}
              disabled={Boolean(busy)}
              data-testid="demo-digest"
            >
              {busy === "digest" ? <Loader2 className="animate-spin" /> : <FileText />}{" "}
              {t("demo.digest")}
            </Button>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>{t("demo.lastRuns")}</SectionLabel>
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs text-fg-3">
              <tr>
                <th className="px-4 py-2 font-medium">{t("set.task")}</th>
                <th className="px-3 py-2 font-medium">{t("demo.customer")}</th>
                <th className="px-3 py-2 font-medium">{t("set.model")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("demo.tokens")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("demo.latency")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("demo.when")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(s?.runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      {r.ok ? (
                        <CircleCheck className="size-3.5 text-ok" aria-label="ok" />
                      ) : (
                        <CircleX className="size-3.5 text-critical" aria-label="failed" />
                      )}
                      {r.task}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-fg-2">{r.customer ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-2">
                    {r.provider}/{r.model}
                  </td>
                  <td className="num px-3 py-2 text-right font-mono text-fg-2">
                    {r.tokens.toLocaleString("en-US")}
                  </td>
                  <td className="num px-3 py-2 text-right font-mono text-fg-2">
                    {(r.latencyMs / 1000).toFixed(1)} s
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-fg-3">
                    <TimeAgo date={r.at} />
                  </td>
                </tr>
              ))}
              {s && !s.runs.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-fg-3">
                    {t("demo.noRuns")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BigAction({
  n,
  icon,
  title,
  hint,
  onClick,
  busy,
  disabled,
  testId,
  primary,
  live,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  testId: string;
  primary?: boolean;
  live?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "group flex min-h-32 flex-col justify-between gap-4 rounded-lg border p-5 text-left transition-colors disabled:opacity-60",
        primary
          ? "border-accent/40 bg-accent-soft hover:border-accent"
          : "bg-surface hover:bg-surface-2",
      )}
    >
      <span className="flex items-center justify-between">
        <span className="num font-mono text-xs text-fg-3">{String(n).padStart(2, "0")}</span>
        <span className={cn("[&_svg]:size-5", primary ? "text-accent-text" : "text-fg-2")}>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : live ? (
            <LiveDot className="size-2.5" />
          ) : (
            icon
          )}
        </span>
      </span>
      <span>
        <span className="block text-lg font-semibold text-fg">{title}</span>
        <span className="mt-1 block text-sm text-fg-3">{hint}</span>
      </span>
    </button>
  );
}

function Check({
  state,
  title,
  detail,
  extra,
  time,
}: {
  state: "ok" | "warn" | "fail" | "wait";
  title: string;
  detail: string;
  extra?: string;
  time?: string | null;
}) {
  const Icon =
    state === "ok"
      ? CircleCheck
      : state === "warn"
        ? TriangleAlert
        : state === "fail"
          ? CircleX
          : Loader2;
  return (
    <li className="flex items-start gap-3 px-4 py-3" data-state={state}>
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          state === "ok"
            ? "text-ok"
            : state === "warn"
              ? "text-medium"
              : state === "fail"
                ? "text-critical"
                : "animate-spin text-fg-3",
        )}
        aria-label={state}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-medium text-fg">{title}</span>
          {time ? (
            <span className="text-xs text-fg-3">
              <TimeAgo date={time} />
            </span>
          ) : null}
        </div>
        <p className="text-sm text-fg-2">{detail}</p>
        {extra ? <p className="mt-1 text-xs text-medium">{extra}</p> : null}
      </div>
    </li>
  );
}

function Num({ label, value, tone }: { label: string; value: number | undefined; tone?: "critical" }) {
  // Label first in the DOM (reads "Pending 0"), value on top visually.
  return (
    <div className="flex flex-col-reverse bg-surface px-2 py-3">
      <div className="mt-0.5 text-xs text-fg-3 uppercase">{label}</div>
      <div className={cn("num text-xl font-semibold text-fg", tone === "critical" && "text-critical")}>{value ?? "—"}</div>
    </div>
  );
}
