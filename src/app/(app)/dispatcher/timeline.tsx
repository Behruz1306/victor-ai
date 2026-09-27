"use client";

import * as React from "react";
import { ListTodo, Send } from "lucide-react";
import { useT } from "@/components/providers";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ChatTypeChip, SignalBadge, UntrustedBadge, useClock } from "@/components/common";
import { cn } from "@/lib/utils";
import { pick } from "@/lib/types";
import type { Detail } from "./types";

export function Timeline({
  detail,
  focusChannel,
}: {
  detail: Detail;
  focusChannel: string | null;
}) {
  const { t, lang } = useT();
  const clock = useClock(detail.timezone);
  const [onlyFocus, setOnlyFocus] = React.useState(false);
  const chans = new Map(detail.channels.map((c) => [c.id, c]));
  const msgs =
    onlyFocus && focusChannel
      ? detail.timeline.filter((m) => m.channelId === focusChannel)
      : detail.timeline;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const last = msgs.at(-1)?.id;
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last, detail.customer.id, onlyFocus]);

  const dayOf = (d: string) =>
    new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
      timeZone: detail.timezone,
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(d));

  let lastDay = "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">{t("disp.timeline")}</h2>
          <p className="text-[11px] text-muted-foreground">{t("disp.timelineHint")}</p>
        </div>
        {focusChannel ? (
          <div className="flex rounded-md border p-0.5 text-[11px]">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                className={cn(
                  "rounded px-2 py-0.5",
                  onlyFocus === v ? "bg-muted font-medium" : "text-muted-foreground",
                )}
                onClick={() => setOnlyFocus(v)}
              >
                {v ? t("disp.thisChatOnly") : t("disp.allChatsFilter")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" data-testid="timeline">
        {msgs.length === 0 ? <EmptyState title={t("disp.noMessages")} /> : null}
        {msgs.map((m) => {
          const ch = chans.get(m.channelId);
          const day = dayOf(m.sentAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const marks = detail.highlights[m.id] ?? [];
          const staff = m.side === "employee" || m.side === "bot";
          return (
            <React.Fragment key={m.id}>
              {showDay ? (
                <div className="sticky top-0 z-10 -mx-3 mb-1 flex justify-center bg-card py-1.5">
                  <span className="rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs">
                    {day}
                  </span>
                </div>
              ) : null}
              <article
                id={`m-${m.id}`}
                className={cn(
                  "group mb-1 flex gap-2.5 rounded-md border-l-2 px-2 py-1.5",
                  marks.some((x) => x.type === "signal" && (x.severity ?? 0) >= 4)
                    ? "border-sev-5 bg-sev-5-soft/60"
                    : marks.length
                      ? "border-primary bg-primary-soft/40"
                      : "border-transparent",
                )}
              >
                <time className="w-14 shrink-0 pt-0.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                  {clock(m.sentAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ChatTypeChip type={ch?.chatType ?? null} />
                    <span className="text-[11px] text-muted-foreground">{ch?.title}</span>
                    <span
                      className={cn(
                        "text-[13px] font-semibold",
                        staff ? "text-foreground" : "text-chip-customer",
                      )}
                    >
                      {m.userName ?? m.sender}
                    </span>
                    {m.untrusted ? <UntrustedBadge /> : null}
                    {m.viaPulse ? (
                      <Badge tone="primary">
                        <Send /> {t("disp.sentVia")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-[13.5px] leading-snug whitespace-pre-wrap">{m.text}</p>
                  {marks.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {marks.map((x, i) =>
                        x.type === "task" ? (
                          <Badge key={i} tone="primary">
                            <ListTodo /> {t("disp.createdTask")}: {pick(x.label, lang)}
                          </Badge>
                        ) : (
                          <SignalBadge key={i} kind={x.kind!} severity={x.severity ?? 3} />
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
