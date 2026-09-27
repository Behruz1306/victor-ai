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
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost, type Jsonify } from "@/lib/client/api";
import type { demoStatus } from "@/lib/demo/control";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
} from "@/components/ui/primitives";
import { LoadingRows, TimeAgo } from "@/components/common";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Status = Jsonify<Awaited<ReturnType<typeof demoStatus>>> & {
  system: {
    workerAlive: boolean;
    workerLastSeen: string | null;
    telegram: { configured: boolean; username: string | null };
  };
  llm: { provider: string; model: string; fastModel: string };
};
type Action = "reset" | "load" | "replay_start" | "replay_stop" | "sla" | "digest";

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
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  const s = q.data;
  const replaying = (s?.replayLeft ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("demo.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("demo.subtitle")}</p>
      </div>
      {s && !s.system.workerAlive ? (
        <p className="flex items-center gap-2 rounded-md border border-sev-4/40 bg-sev-4-soft px-3 py-2 text-sm text-sev-4">
          <AlertTriangle className="size-4" /> {t("demo.workerHint")}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          icon={<RotateCcw />}
          title={t("demo.reset")}
          hint={t("demo.resetHint")}
          busy={busy === "reset"}
          onClick={() => run("reset")}
          variant="outline"
          testId="demo-reset"
        />
        <ActionCard
          icon={<Download />}
          title={t("demo.load")}
          hint={t("demo.loadHint")}
          busy={busy === "load"}
          onClick={() => run("load")}
          testId="demo-load"
        />
        {replaying ? (
          <ActionCard
            icon={<Square />}
            title={t("demo.stopReplay")}
            hint={`${t("demo.replayLeft")}: ${s?.replayLeft}/${s?.replayTotal}`}
            busy={busy === "replay_stop"}
            onClick={() => run("replay_stop")}
            variant="danger"
            testId="demo-replay-stop"
          />
        ) : (
          <ActionCard
            icon={<Play />}
            title={t("demo.startReplay")}
            hint={t("demo.replayHint")}
            busy={busy === "replay_start"}
            onClick={() => run("replay_start")}
            testId="demo-replay-start"
          />
        )}
        <ActionCard
          icon={<Timer />}
          title={t("demo.runSla")}
          busy={busy === "sla"}
          onClick={() => run("sla")}
          variant="outline"
          testId="demo-sla"
        />
        <ActionCard
          icon={<FileText />}
          title={t("demo.digest")}
          busy={busy === "digest"}
          onClick={() => run("digest")}
          variant="outline"
          testId="demo-digest"
        />
      </div>
      {message ? (
        <p
          role="status"
          className={cn("flex items-center gap-1.5 text-sm", message.ok ? "text-ok" : "text-sev-5")}
        >
          {message.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}{" "}
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Activity className="size-4" /> {t("demo.queue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {!s ? (
              <LoadingRows rows={3} />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 text-center" data-testid="demo-queue">
                  <Num label={t("demo.pending")} value={s.queue.pending} />
                  <Num label={t("demo.running")} value={s.queue.running} />
                  <Num
                    label={t("demo.failed")}
                    value={s.queue.failed}
                    tone={s.queue.failed ? "text-sev-5" : undefined}
                  />
                  <Num label={t("demo.done")} value={s.queue.done} />
                </div>
                <div className="grid grid-cols-4 gap-2 rounded-md bg-muted/50 p-2 text-center">
                  <Num label={t("demo.messages")} value={s.counts.messages} />
                  <Num label={t("demo.tasks")} value={s.counts.tasks} />
                  <Num label={t("demo.signals")} value={s.counts.signals} />
                  <Num label={t("demo.suggestions")} value={s.counts.suggestions} />
                </div>
                <Line label={t("demo.provider")}>
                  <Badge tone="outline">{s.llm.provider}</Badge>{" "}
                  <span className="text-xs text-muted-foreground">{s.llm.model}</span>
                </Line>
                <Line label={t("set.worker")}>
                  {s.system.workerAlive && s.system.workerLastSeen ? (
                    <span className="text-ok">
                      <TimeAgo date={s.system.workerLastSeen} />
                    </span>
                  ) : (
                    <span className="text-sev-4">{t("set.disabled")}</span>
                  )}
                </Line>
                <Line label={t("set.telegram")}>
                  {s.system.telegram.configured
                    ? `@${s.system.telegram.username}`
                    : t("set.disabled")}
                </Line>
                {s.failedJobs.map((f, i) => (
                  <p key={i} className="truncate text-xs text-sev-5" title={f.error ?? ""}>
                    {f.type}: {f.error}
                  </p>
                ))}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("demo.lastRuns")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!s ? (
              <LoadingRows rows={4} />
            ) : !s.runs.length ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  {s.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                        <TimeAgo date={r.at} />
                      </td>
                      <td className="py-1.5 font-mono">{r.task}</td>
                      <td className="py-1.5">{r.customer ?? ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.tokens} tok</td>
                      <td className="py-1.5 text-right tabular-nums">{r.latencyMs} ms</td>
                      <td className="py-1.5 text-right">
                        {r.ok ? (
                          <CheckCircle2 className="inline size-3.5 text-ok" />
                        ) : (
                          <XCircle className="inline size-3.5 text-sev-5" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const LABEL: Record<Action, TKey> = {
  reset: "demo.reset",
  load: "demo.load",
  replay_start: "demo.startReplay",
  replay_stop: "demo.stopReplay",
  sla: "demo.runSla",
  digest: "demo.digest",
};

function ActionCard({
  icon,
  title,
  hint,
  busy,
  onClick,
  variant = "default",
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  busy: boolean;
  onClick: () => void;
  variant?: "default" | "outline" | "danger";
  testId: string;
}) {
  return (
    <Card className="flex flex-col justify-between gap-2 p-3">
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <span />}
      <Button variant={variant} onClick={onClick} disabled={busy} data-testid={testId}>
        {busy ? <Loader2 className="animate-spin" /> : icon} {title}
      </Button>
    </Card>
  );
}

function Num({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
