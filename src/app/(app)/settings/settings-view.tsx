"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Cpu,
  Timer,
  ShieldCheck,
  Eye,
  Plus,
  Trash2,
  Megaphone,
  ScrollText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { apiGet, apiPost, type Jsonify } from "@/lib/client/api";
import type { auditEntries, settingsData } from "@/lib/queries/settings";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { LoadingRows, TimeAgo } from "@/components/common";
import { SIGNAL_KINDS } from "@/lib/constants";
import type { WatchCriterion } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

type Data = Jsonify<NonNullable<Awaited<ReturnType<typeof settingsData>>>>;
type Audit = Jsonify<Awaited<ReturnType<typeof auditEntries>>>;

export function SettingsView({ canEdit, canAudit }: { canEdit: boolean; canAudit: boolean }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<Data>("/api/settings"),
    refetchInterval: 15_000,
  });
  if (q.isError)
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  if (!q.data) return <LoadingRows rows={6} />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">{t("set.title")}</h1>
      {!canEdit ? <p className="text-sm text-muted-foreground">{t("set.onlyOwner")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <SlaCard data={q.data} canEdit={canEdit} />
        <SystemCard data={q.data} />
        <SendCard data={q.data} canEdit={canEdit} />
        <UsageCard data={q.data} />
        <div className="lg:col-span-2">
          <CriteriaCard data={q.data} canEdit={canEdit} />
        </div>
      </div>
      {canAudit ? <AuditCard /> : null}
    </div>
  );
}

function useSave() {
  const qc = useQueryClient();
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const save = async (body: unknown) => {
    setState("saving");
    try {
      await apiPost("/api/settings", body);
      setState("saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };
  return { save, state, error };
}

function SaveRow({
  state,
  error,
  onSave,
  disabled,
}: {
  state: string;
  error: string | null;
  onSave: () => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      {state === "saved" ? (
        <span className="flex items-center gap-1 text-xs text-ok">
          <CheckCircle2 className="size-3.5" /> {t("set.saved")}
        </span>
      ) : null}
      {state === "error" ? <span className="text-xs text-sev-5">{error}</span> : null}
      <Button size="sm" onClick={onSave} disabled={disabled || state === "saving"}>
        {t("common.save")}
      </Button>
    </div>
  );
}

function SlaCard({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const { t } = useT();
  const [sla, setSla] = React.useState(data.sla);
  const { save, state, error } = useSave();
  const field = (key: keyof typeof sla, label: TKey) => (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`sla-${key}`} className="text-sm font-normal text-foreground">
        {t(label)}
      </Label>
      <Input
        id={`sla-${key}`}
        type="number"
        className="w-24 text-right"
        min={0}
        disabled={!canEdit}
        value={String(sla[key] ?? "")}
        onChange={(e) => setSla({ ...sla, [key]: Number(e.target.value) })}
      />
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Timer className="size-4" /> {t("set.sla")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("set.timezone")}: {data.company.timezone}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {field("ackMinutes", "set.ack")}
        {field("etaAnswerMinutes", "set.eta")}
        {field("deadlineRequiredMinutes", "set.deadline")}
        {field("deadlineGraceMinutes", "set.grace")}
        {field("customerSilentDays", "set.silent")}
        {canEdit ? (
          <SaveRow
            state={state}
            error={error}
            onSave={() =>
              save({
                sla: {
                  ackMinutes: sla.ackMinutes,
                  etaAnswerMinutes: sla.etaAnswerMinutes,
                  deadlineRequiredMinutes: sla.deadlineRequiredMinutes,
                  deadlineGraceMinutes: sla.deadlineGraceMinutes,
                  customerSilentDays: sla.customerSilentDays,
                },
              })
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function SystemCard({ data }: { data: Data }) {
  const { t } = useT();
  const tg = data.system.telegram;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Send className="size-4" /> {t("set.telegram")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-sm">
        <Row label={t("set.bot")}>
          {tg.configured ? (
            <strong>@{tg.username}</strong>
          ) : (
            <span className="text-muted-foreground">
              {tg.placeholder ? t("set.botPlaceholder") : t("set.botNotConfigured")}
            </span>
          )}
        </Row>
        {tg.configured ? (
          <p data-testid="bot-status" className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className={`size-2 rounded-full ${tg.online ? "bg-ok" : "bg-sev-4"}`}
            />
            <span className={tg.online ? "text-ok" : "text-sev-4"}>
              {tg.online ? t("set.botOnline") : t("set.botOffline")}
            </span>
            <span className="text-muted-foreground">
              ·{" "}
              {tg.lastUpdateAt ? (
                t("set.botLastUpdate", { t: agoShort(tg.lastUpdateAt) })
              ) : (
                t("set.botNoUpdates")
              )}
            </span>
          </p>
        ) : null}
        {tg.configured ? (
          <Row label={t("set.canRead")}>
            {tg.canReadAllGroupMessages ? (
              <Badge tone="ok">
                <CheckCircle2 /> {t("common.yes")}
              </Badge>
            ) : (
              <Badge tone="sev4">
                <AlertTriangle /> {t("set.privacyOn")}
              </Badge>
            )}
          </Row>
        ) : null}
        {!tg.configured || !tg.canReadAllGroupMessages ? (
          <p className="rounded-md bg-sev-3-soft px-2.5 py-1.5 text-xs text-sev-3">
            {t("set.privacyWarn")}
          </p>
        ) : null}
        <Row label={t("set.business")}>
          {tg.businessEnabled ? t("set.enabled") : t("set.disabled")}
        </Row>
        <Row label={t("set.worker")}>
          {data.system.workerAlive && data.system.workerLastSeen ? (
            <span className="text-ok">
              {t("set.workerAlive")} <TimeAgo date={data.system.workerLastSeen} />
            </span>
          ) : (
            <span className="text-sev-4">{t("set.workerDown")}</span>
          )}
        </Row>
      </CardContent>
    </Card>
  );
}

function agoShort(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function SendCard({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const { t } = useT();
  const [s, setS] = React.useState(data.settings);
  const { save, state, error } = useSave();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ShieldCheck className="size-4" /> {t("set.sendMode")} · {t("set.retention")} ·{" "}
          {t("set.consent")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <fieldset className="flex flex-col gap-1.5" disabled={!canEdit}>
          {(["copy", "bot"] as const).map((m) => (
            <label key={m} className="flex items-start gap-2">
              <input
                type="radio"
                name="sendMode"
                checked={s.sendMode === m}
                onChange={() => setS({ ...s, sendMode: m })}
                className="mt-1"
              />
              <span>{t(m === "copy" ? "set.sendCopy" : "set.sendBot")}</span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("set.botEnvNote")}</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.signWithName}
              onChange={(e) => setS({ ...s, signWithName: e.target.checked })}
            />
            {t("set.signWithName")}
          </label>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="retention" className="text-sm font-normal text-foreground">
              {t("set.retention")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("set.retentionHint")}</p>
          </div>
          <Input
            id="retention"
            type="number"
            min={1}
            className="w-24 text-right"
            disabled={!canEdit}
            value={s.retentionDays}
            onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="consent"
            className="flex items-center gap-1 text-sm font-normal text-foreground"
          >
            <Megaphone className="size-3.5" /> {t("set.consent")}
          </Label>
          <Textarea
            id="consent"
            rows={2}
            disabled={!canEdit}
            value={s.consentText}
            onChange={(e) => setS({ ...s, consentText: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t("set.consentHint")}</p>
        </div>
        {canEdit ? (
          <SaveRow
            state={state}
            error={error}
            onSave={() =>
              save({
                settings: {
                  sendMode: s.sendMode,
                  retentionDays: s.retentionDays,
                  consentText: s.consentText,
                  signWithName: s.signWithName,
                },
              })
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsageCard({ data }: { data: Data }) {
  const { t } = useT();
  const u = data.usage;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Cpu className="size-4" /> {t("set.llm")}
        </CardTitle>
        {data.ai.mode === "offline" ? (
          <p className="text-xs text-sev-3">{t("set.aiOffline")}</p>
        ) : data.ai.active.id === "mock" ? (
          <p className="text-xs text-muted-foreground">{t("set.llmMock")}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <Row label={t("set.aiActive")}>
          <span data-testid="ai-active">
            <strong>{data.ai.active.label}</strong>{" "}
            <span className="font-mono text-xs text-muted-foreground">{data.ai.active.model}</span>
          </span>
        </Row>
        <div className="text-xs font-medium text-muted-foreground">{t("set.aiChain")}</div>
        <ol className="flex flex-col gap-1" data-testid="ai-chain">
          {data.ai.providers.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="font-mono text-muted-foreground">{i + 1}.</span>
                <strong>{p.label}</strong>
                <span className="truncate font-mono text-muted-foreground">
                  {p.models.join(", ")}
                  {p.fastModels[0] !== p.models[0] ? ` · fast ${p.fastModels.join(", ")}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {p.kind !== "mock" ? (
                  <span title={t("set.aiFreeTier")}>
                    {t("set.aiRequestsToday")}: {p.requestsToday}
                    {p.dailyLimit ? `/${p.dailyLimit}` : ""}
                  </span>
                ) : null}
                <Badge tone={p.state === "ready" ? "ok" : "sev3"}>
                  {t(`set.aiState.${p.state}` as TKey)}
                  {p.state === "cooling_down" && p.cooldownUntil
                    ? ` · ${t("set.aiUntil", { t: new Date(p.cooldownUntil).toLocaleTimeString() })}`
                    : ""}
                </Badge>
              </span>
            </li>
          ))}
        </ol>
        {data.ai.cachedHits24h ? (
          <p className="text-[11px] text-muted-foreground">
            {t("set.aiCached", { n: data.ai.cachedHits24h })}
          </p>
        ) : null}
        {data.ai.warnings.length ? (
          <ul className="flex flex-col gap-1 rounded-md bg-sev-3-soft px-2.5 py-1.5 text-xs text-sev-3">
            {data.ai.warnings.map((w) => (
              <li key={w}>
                <AlertTriangle className="mr-1 inline size-3" />
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-1 grid grid-cols-4 gap-2 rounded-md bg-muted/50 p-2 text-center">
          <Stat label={t("set.calls")} value={fmt(u.totals.calls)} />
          <Stat label={t("set.tokensIn")} value={fmt(u.totals.inputTokens)} />
          <Stat label={t("set.tokensOut")} value={fmt(u.totals.outputTokens)} />
          <Stat
            label={t("set.cost")}
            value={u.totals.costUsd == null ? "—" : `$${u.totals.costUsd.toFixed(4)}`}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("set.usage30")}. {t("set.costNote")}
        </p>
        {u.items.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("set.task")}</th>
                <th className="py-1 font-medium">{t("set.model")}</th>
                <th className="py-1 text-right font-medium">{t("set.calls")}</th>
                <th className="py-1 text-right font-medium">in / out</th>
                <th className="py-1 text-right font-medium">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {u.items.map((i) => (
                <tr key={`${i.task}-${i.model}`}>
                  <td className="py-1">{i.task}</td>
                  <td className="py-1 text-muted-foreground">{i.model}</td>
                  <td className="py-1 text-right tabular-nums">
                    {i.calls}
                    {i.failed ? (
                      <span className="text-sev-5">
                        {" "}
                        ({i.failed} {t("set.failed")})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {fmt(i.inputTokens)} / {fmt(i.outputTokens)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{i.avgLatencyMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CriteriaCard({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const { t } = useT();
  const [items, setItems] = React.useState<WatchCriterion[]>(data.criteria);
  const { save, state, error } = useSave();
  const update = (id: string, patch: Partial<WatchCriterion>) =>
    setItems(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <Card id="criteria">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Eye className="size-4" /> {t("set.criteria")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("set.criteriaHint")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={c.text}
                disabled={!canEdit}
                onChange={(e) => update(c.id, { text: e.target.value })}
              />
              <Select
                className="w-28"
                disabled={!canEdit}
                value={c.minSeverity}
                onChange={(e) => update(c.id, { minSeverity: Number(e.target.value) })}
                aria-label={t("set.minSeverity")}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    ≥ {t(`sev.${n}` as TKey)}
                  </option>
                ))}
              </Select>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("set.remove")}
                  onClick={() => setItems(items.filter((x) => x.id !== c.id))}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {SIGNAL_KINDS.map((k) => {
                const on = c.kinds.includes(k);
                return (
                  <button
                    key={k}
                    disabled={!canEdit}
                    onClick={() =>
                      update(c.id, { kinds: on ? c.kinds.filter((x) => x !== k) : [...c.kinds, k] })
                    }
                    className={
                      on
                        ? "rounded border border-primary bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary"
                        : "rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    }
                  >
                    {t(`signal.${k}` as TKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {canEdit ? (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setItems([
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    text: "",
                    kinds: ["complaint"],
                    customerIds: [],
                    minSeverity: 3,
                  },
                ])
              }
            >
              <Plus /> {t("set.addCriterion")}
            </Button>
            <SaveRow
              state={state}
              error={error}
              onSave={() =>
                save({ criteria: items.filter((c) => c.text.trim() && c.kinds.length) })
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AuditCard() {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiGet<{ entries: Audit }>("/api/audit"),
    refetchInterval: 15_000,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ScrollText className="size-4" /> {t("set.audit")}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!q.data ? (
          <LoadingRows rows={3} />
        ) : !q.data.entries.length ? (
          <p className="text-sm text-muted-foreground">{t("set.auditEmpty")}</p>
        ) : (
          <table className="w-full min-w-[600px] text-xs" data-testid="audit-table">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">{t("set.auditWhen")}</th>
                <th className="py-1.5 font-medium">{t("set.auditUser")}</th>
                <th className="py-1.5 font-medium">{t("set.auditAction")}</th>
                <th className="py-1.5 font-medium">{t("set.auditTarget")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                    <TimeAgo date={e.at} />
                  </td>
                  <td className="py-1.5">{e.user ?? "—"}</td>
                  <td className="py-1.5 font-mono">{e.action}</td>
                  <td
                    className="max-w-[420px] truncate py-1.5 text-muted-foreground"
                    title={JSON.stringify(e.meta)}
                  >
                    {Object.entries(e.meta ?? {})
                      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ") ||
                      e.target ||
                      ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
