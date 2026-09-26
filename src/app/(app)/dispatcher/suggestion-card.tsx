"use client";

import * as React from "react";
import { Check, Pencil, X, Link2, BookOpenCheck, Sparkles, Send, Copy } from "lucide-react";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { ChatTypeChip, useClock } from "@/components/common";
import { apiPost } from "@/lib/client/api";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import type { DetailSuggestion } from "./types";

export type ActionResult = {
  mode: "recorded" | "bot" | "copy";
  text: string;
  rule?: { ruleText: string; customerName: string | null; status: string } | null;
};

export function SuggestionCard({
  s,
  timezone,
  sendMode,
  onDone,
}: {
  s: DetailSuggestion;
  timezone: string;
  sendMode: "copy" | "bot";
  onDone: (kind: "approve" | "edit" | "dismiss", res?: ActionResult) => void;
}) {
  const { t, lang } = useT();
  const clock = useClock(timezone);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(s.text);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!editing) setText(s.text);
  }, [s.text, editing]);

  const sends = s.source === "demo" || (s.source === "telegram" && sendMode === "bot");
  const run = async (kind: "approve" | "edit" | "dismiss") => {
    setBusy(true);
    setError(null);
    try {
      if (kind === "dismiss") {
        await apiPost(`/api/suggestions/${s.id}/dismiss`);
        onDone("dismiss");
        return;
      }
      const res =
        kind === "approve"
          ? await apiPost<ActionResult>(`/api/suggestions/${s.id}/approve`)
          : await apiPost<ActionResult>(`/api/suggestions/${s.id}/edit`, {
              text,
              reason: reason || null,
            });
      if (res.mode === "copy") await navigator.clipboard?.writeText(res.text).catch(() => {});
      onDone(kind, res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cross = s.usedContext.filter((c) => c.crossChat);
  const same = s.usedContext.filter((c) => !c.crossChat);
  return (
    <Card className="overflow-hidden border-primary/30" data-testid="suggestion-card">
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-primary-soft/40 px-3 py-2">
        <Sparkles className="size-3.5 text-primary" />
        <Badge tone="primary">{t(`intent.${s.intent}` as TKey)}</Badge>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          {t("disp.to")}: <ChatTypeChip type={s.chatType} />{" "}
          <span className="font-medium text-foreground">{s.channelTitle}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-${s.id}`}>{t("disp.editing")}</Label>
            <Textarea
              id={`edit-${s.id}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              data-testid="suggestion-edit-text"
            />
            <Label htmlFor={`reason-${s.id}`}>{t("disp.reason")}</Label>
            <Input
              id={`reason-${s.id}`}
              value={reason}
              placeholder={t("disp.reasonPh")}
              onChange={(e) => setReason(e.target.value)}
              data-testid="suggestion-edit-reason"
            />
          </div>
        ) : (
          <p
            className="rounded-md border bg-card px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap"
            data-testid="suggestion-text"
          >
            {s.text}
          </p>
        )}
        <div className="text-xs leading-relaxed">
          <span className="font-semibold">{t("disp.why")}: </span>
          <span className="text-muted-foreground">{pick(s.rationale, lang)}</span>
        </div>
        {cross.length ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-chip-fleet/30 bg-chip-fleet/5 p-2"
            data-testid="used-context"
          >
            <div className="flex items-center gap-1 text-[11px] font-semibold text-chip-fleet">
              <Link2 className="size-3" /> {t("disp.usedContext")}:
            </div>
            {cross.map((c) => (
              <a key={c.id} href={`#m-${c.id}`} className="flex gap-1.5 text-xs hover:underline">
                <ChatTypeChip type={c.chatType} />
                <span className="shrink-0 font-medium">
                  {c.channelTitle} {clock(c.sentAt)}
                </span>
                <span className="line-clamp-2 text-muted-foreground">
                  {c.sender.split(/[(|]/)[0]?.trim()}: {c.text}
                </span>
              </a>
            ))}
          </div>
        ) : same.length ? (
          <p className="text-[11px] text-muted-foreground">
            {t("disp.usedContext")}:{" "}
            {same.map((c) => `${c.channelTitle} ${clock(c.sentAt)}`).join(", ")}
          </p>
        ) : null}
        {s.rules.length ? (
          <div className="flex flex-col gap-1" data-testid="applied-rules">
            {s.rules.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-1.5 rounded bg-ok-soft px-2 py-1 text-xs text-ok"
              >
                <BookOpenCheck className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{t("disp.appliedRules")}:</span> {r.text}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-xs text-sev-5">{error}</p> : null}
        <div className={cn("flex flex-wrap gap-2", editing && "justify-end")}>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={() => run("edit")}
                disabled={busy || !text.trim()}
                data-testid="suggestion-save-edit"
              >
                <Check /> {t("disp.saveEdit")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => run("approve")}
                disabled={busy}
                data-testid="suggestion-approve"
              >
                {sends ? <Send /> : <Copy />}{" "}
                {sends ? t("disp.approveSend") : t("disp.approveCopy")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={busy}
                data-testid="suggestion-edit"
              >
                <Pencil /> {t("disp.edit")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run("dismiss")}
                disabled={busy}
                className="ml-auto text-muted-foreground"
              >
                <X /> {t("disp.dismiss")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
