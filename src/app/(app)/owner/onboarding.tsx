"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Trash2, Check } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, Card, Textarea } from "@/components/ui/primitives";
import type { WatchCriterion } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

/** Owner's first-login chat: three questions → criteria he can edit (the owner can't write rules upfront). */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const questions: TKey[] = ["onb.q1", "onb.q2", "onb.q3"];
  const [answers, setAnswers] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [items, setItems] = React.useState<WatchCriterion[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const step = answers.length;

  const next = async () => {
    const all = [...answers, draft.trim()];
    setAnswers(all);
    setDraft("");
    if (all.length < 3) return;
    setBusy(true);
    try {
      const res = await apiPost<{ items: WatchCriterion[] }>("/api/owner/criteria", {
        action: "propose",
        answers: all,
      });
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async (action: "save" | "skip") => {
    setBusy(true);
    try {
      await apiPost(
        "/api/owner/criteria",
        action === "save" ? { action, items: items ?? [], answers } : { action },
      );
      await qc.invalidateQueries({ queryKey: ["owner"] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="onboarding">
      <div>
        <h2 className="text-base font-semibold">{t("onb.title")}</h2>
        <p className="text-xs text-fg-3">{t("onb.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-2">
        {questions.slice(0, Math.min(step + 1, 3)).map((q, i) => (
          <React.Fragment key={q}>
            <div className="flex items-start gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                <Bot className="size-3.5" />
              </span>
              <p className="rounded-lg rounded-tl-none bg-surface-2 px-3 py-2 text-sm">{t(q)}</p>
            </div>
            {answers[i] !== undefined ? (
              <p className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-accent-soft px-3 py-2 text-sm">
                {answers[i] || "—"}
              </p>
            ) : null}
          </React.Fragment>
        ))}
      </div>
      {step < 3 ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("onb.placeholder")}
            rows={2}
            data-testid="onboarding-answer"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                e.preventDefault();
                void next();
              }
            }}
          />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => finish("skip")} disabled={busy}>
              {t("onb.skip")}
            </Button>
            <Button
              size="sm"
              onClick={next}
              disabled={!draft.trim() || busy}
              data-testid="onboarding-next"
            >
              {step === 2 ? t("onb.finish") : t("onb.next")}
            </Button>
          </div>
        </div>
      ) : busy && !items ? (
        <p className="flex items-center gap-2 text-sm text-fg-3">
          <Loader2 className="size-4 animate-spin" /> {t("onb.building")}
        </p>
      ) : items ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("onb.result")}</h3>
          <ul className="flex flex-col gap-1.5">
            {items.map((c) => (
              <li key={c.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm">{c.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.kinds.map((k) => (
                      <Badge key={k} tone="neutral">
                        {t(`signal.${k}` as TKey)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <button
                  aria-label={t("set.remove")}
                  className="text-fg-3 hover:text-critical"
                  onClick={() => setItems(items.filter((x) => x.id !== c.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => finish("skip")} disabled={busy}>
              {t("onb.skip")}
            </Button>
            <Button
              size="sm"
              onClick={() => finish("save")}
              disabled={busy}
              data-testid="onboarding-save"
            >
              <Check /> {t("onb.done")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-xs text-critical">{error}</p> : null}
    </Card>
  );
}
