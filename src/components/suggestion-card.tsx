"use client";

import * as React from "react";
import {
  Check,
  Pencil,
  X,
  Link2,
  BookOpenCheck,
  Sparkles,
  Send,
  Copy,
  ArrowRight,
} from "lucide-react";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Kbd, Label, Textarea, Input } from "@/components/ui/primitives";
import { ChatTypeChip, ChatTypeIcon, useClock } from "@/components/common";
import { apiPost } from "@/lib/client/api";
import { pick, type L10n } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

export type SuggestionData = {
  id: string;
  channelId: string;
  channelTitle: string;
  chatType: string | null;
  source: string;
  intent: string;
  text: string;
  rationale: L10n;
  createdAt: string;
  usedContext: {
    id: string;
    channelTitle: string;
    chatType: string | null;
    sentAt: string;
    sender: string;
    text: string;
    crossChat: boolean;
  }[];
  rules: { id: string; text: string }[];
};

export type ActionResult = {
  mode: "recorded" | "bot" | "copy";
  text: string;
  rule?: { ruleText: string; customerName: string | null; status: string } | null;
};

export type SuggestionHandle = {
  approve: () => void;
  edit: () => void;
  cancel: () => void;
  element: () => HTMLElement | null;
};

export const SuggestionCard = React.forwardRef<
  SuggestionHandle,
  {
    s: SuggestionData;
    timezone: string;
    sendMode: "copy" | "bot";
    fresh?: boolean;
    onDone: (kind: "approve" | "edit" | "dismiss", res?: ActionResult, from?: DOMRect) => void;
  }
>(function SuggestionCard({ s, timezone, sendMode, fresh, onDone }, ref) {
  const { t, lang } = useT();
  const clock = useClock(timezone);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(s.text);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const root = React.useRef<HTMLElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!editing) setText(s.text);
  }, [s.text, editing]);

  const sends = s.source === "demo" || (s.source === "telegram" && sendMode === "bot");
  const run = React.useCallback(
    async (kind: "approve" | "edit" | "dismiss") => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const from = root.current?.getBoundingClientRect();
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
        setEditing(false);
        onDone(kind, res, from);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, s.id, text, reason, onDone],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      approve: () => {
        if (!editing) void run("approve");
      },
      edit: () => {
        setEditing(true);
        requestAnimationFrame(() => textRef.current?.focus());
      },
      cancel: () => setEditing(false),
      element: () => root.current,
    }),
    [editing, run],
  );

  const cross = s.usedContext.filter((c) => c.crossChat);
  const same = s.usedContext.filter((c) => !c.crossChat);
  return (
    <article
      ref={root}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-accent/30 bg-surface",
        fresh && "animate-glow",
      )}
      data-testid="suggestion-card"
      aria-label={t("disp.suggestion")}
    >
      <header className="flex items-center gap-2 border-b border-accent/15 bg-accent-soft px-3 py-2">
        <Sparkles className="size-3.5 shrink-0 text-accent-text" aria-hidden />
        <span className="text-sm font-medium text-accent-text">
          {t(`intent.${s.intent}` as TKey)}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-fg-3">
          <ArrowRight className="size-3 shrink-0" aria-hidden />
          <ChatTypeIcon type={s.chatType} className="size-3" />
          <span className="truncate font-medium text-fg-2">{s.channelTitle}</span>
        </span>
      </header>

      <div className="flex flex-col gap-3 p-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-${s.id}`}>{t("disp.editing")}</Label>
            <Textarea
              ref={textRef}
              id={`edit-${s.id}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run("edit");
              }}
              rows={5}
              data-testid="suggestion-edit-text"
            />
            <Label htmlFor={`reason-${s.id}`}>{t("disp.reason")}</Label>
            <Input
              id={`reason-${s.id}`}
              value={reason}
              placeholder={t("disp.reasonPh")}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter") void run("edit");
              }}
              data-testid="suggestion-edit-reason"
            />
            <p className="text-xs text-fg-3">{t("disp.learnHint")}</p>
          </div>
        ) : (
          <p
            className="text-base leading-relaxed whitespace-pre-wrap text-fg"
            data-testid="suggestion-text"
          >
            {s.text}
          </p>
        )}

        <p className="text-sm leading-snug text-fg-2">
          <span className="font-medium text-fg">{t("disp.why")}: </span>
          {pick(s.rationale, lang)}
        </p>

        {cross.length ? (
          <div className="flex flex-col gap-1.5" data-testid="used-context">
            <div className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
              <Link2 className="size-3" aria-hidden /> {t("disp.usedContext")}
            </div>
            {cross.map((c) => (
              <a
                key={c.id}
                href={`#m-${c.id}`}
                className="group flex flex-col gap-1 rounded-md border-l-2 border-border-strong bg-surface-2 px-2.5 py-1.5 transition-colors hover:border-accent"
              >
                <span className="flex items-center gap-1.5 text-xs text-fg-3">
                  <ChatTypeChip type={c.chatType} className="h-4 px-1 text-xs" />
                  <span className="font-medium text-fg-2">{c.channelTitle}</span>
                  <span className="num font-mono">{clock(c.sentAt)}</span>
                  <span className="truncate">· {c.sender.split(/[(|]/)[0]?.trim()}</span>
                </span>
                <span className="line-clamp-2 text-sm text-fg">{c.text}</span>
              </a>
            ))}
          </div>
        ) : same.length ? (
          <p className="text-xs text-fg-3">
            {t("disp.usedContext")}:{" "}
            {same.map((c) => `${c.channelTitle} ${clock(c.sentAt)}`).join(", ")}
          </p>
        ) : null}

        {s.rules.length ? (
          <ul className="flex flex-col gap-1" data-testid="applied-rules">
            {s.rules.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-1.5 rounded-md border border-ok-border bg-ok-soft px-2.5 py-1.5 text-sm text-ok"
              >
                <BookOpenCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">{t("disp.appliedRules")}:</span> {r.text}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        ) : null}

        <div className={cn("flex flex-wrap items-center gap-2 pt-0.5", editing && "justify-end")}>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                {t("common.cancel")} <Kbd className="ml-1">Esc</Kbd>
              </Button>
              <Button
                size="sm"
                onClick={() => void run("edit")}
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
                onClick={() => void run("approve")}
                disabled={busy}
                data-testid="suggestion-approve"
                title={`${t("disp.approveSend")} (A)`}
              >
                {sends ? <Send /> : <Copy />}{" "}
                {sends ? t("disp.approveSend") : t("disp.approveCopy")}
                <Kbd className="ml-1 border-white/25 bg-white/10 text-accent-fg shadow-none">A</Kbd>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  requestAnimationFrame(() => textRef.current?.focus());
                }}
                disabled={busy}
                data-testid="suggestion-edit"
                title={`${t("disp.edit")} (E)`}
              >
                <Pencil /> {t("disp.edit")}
                <Kbd className="ml-1">E</Kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void run("dismiss")}
                disabled={busy}
                className="ml-auto"
                data-testid="suggestion-dismiss"
                aria-label={t("disp.dismiss")}
                title={t("disp.dismiss")}
              >
                <X />
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
});
