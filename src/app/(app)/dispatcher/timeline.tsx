"use client";

import * as React from "react";
import { ListTodo, Send, Users } from "lucide-react";
import { useT } from "@/components/providers";
import { Badge } from "@/components/ui/primitives";
import {
  Avatar,
  ChatTypeChip,
  SignalBadge,
  UntrustedBadge,
  severityLevel,
  useClock,
} from "@/components/common";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { pick } from "@/lib/types";
import type { Detail } from "./types";

const RULE: Record<string, string> = {
  critical: "before:bg-critical",
  high: "before:bg-high",
  medium: "before:bg-medium",
  low: "before:bg-low",
};

export function Timeline({
  detail,
  focusChannel,
  freshIds,
}: {
  detail: Detail;
  focusChannel: string | null;
  freshIds: Set<string>;
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
    if (el && !window.location.hash) el.scrollTop = el.scrollHeight;
  }, [last, detail.customer.id, onlyFocus]);

  const dayOf = (d: string) =>
    new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
      timeZone: detail.timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date(d));

  let lastDay = "";
  let lastKey = "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-fg">{detail.customer.name}</h2>
          <p className="truncate text-xs text-fg-3">
            {t("disp.timelineHint")} · {detail.channels.length} {t("disp.chats")}
            {detail.customer.assignee ? ` · ${detail.customer.assignee}` : ""}
          </p>
        </div>
        {focusChannel ? (
          <div
            className="ml-auto flex h-7 items-center rounded-md border bg-bg p-0.5 text-xs"
            role="group"
            aria-label={t("disp.filter")}
          >
            {[false, true].map((v) => (
              <button
                key={String(v)}
                aria-pressed={onlyFocus === v}
                className={cn(
                  "h-full rounded px-2 font-medium transition-colors",
                  onlyFocus === v
                    ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border)]"
                    : "text-fg-3 hover:text-fg-2",
                )}
                onClick={() => setOnlyFocus(v)}
              >
                {v ? t("disp.thisChatOnly") : t("disp.allChatsFilter")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 focus-visible:outline-offset-[-2px]"
        data-testid="timeline"
        tabIndex={0}
        role="region"
        aria-label={t("disp.timeline")}
      >
        {msgs.length === 0 ? (
          <EmptyState illustration="chats" title={t("disp.noMessages")} />
        ) : null}
        {msgs.map((m) => {
          const ch = chans.get(m.channelId);
          const day = dayOf(m.sentAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const marks = detail.highlights[m.id] ?? [];
          const staff = m.side === "employee" || m.side === "bot";
          const name = m.userName ?? m.sender.replace(/[(|].*$/, "").trim();
          // Consecutive messages from the same person in the same chat collapse their header.
          const key = `${m.channelId}|${name}`;
          const grouped = key === lastKey && !showDay && !marks.length;
          lastKey = key;
          const topSev = marks
            .filter((x) => x.type === "signal")
            .reduce((a, x) => Math.max(a, x.severity ?? 0), 0);
          return (
            <React.Fragment key={m.id}>
              {showDay ? (
                <div className="sticky top-0 z-10 -mx-3 flex items-center gap-3 bg-surface/95 px-5 py-2 backdrop-blur">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-fg-3 first-letter:uppercase">
                    {day}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <article
                id={`m-${m.id}`}
                className={cn(
                  "group relative flex scroll-mt-12 gap-3 rounded-md px-2 target:animate-glow",
                  grouped ? "py-0.5" : "mt-1 py-1.5",
                  staff && "bg-surface-2/55",
                  topSev >= 3 &&
                    "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full",
                  topSev >= 3 && RULE[severityLevel(topSev)],
                  freshIds.has(m.id) && "animate-enter",
                )}
              >
                <div className="w-7 shrink-0 pt-0.5">
                  {grouped ? null : staff ? (
                    <span
                      className="grid size-7 place-items-center rounded-md bg-surface-3 text-fg-2"
                      title={t("disp.team")}
                    >
                      <Users className="size-3.5" aria-hidden />
                    </span>
                  ) : (
                    <Avatar name={name} size={28} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {grouped ? null : (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-fg">{name}</span>
                      {staff ? <span className="text-xs text-fg-3">{t("disp.team")}</span> : null}
                      <ChatTypeChip
                        type={ch?.chatType ?? null}
                        className="h-[18px] px-1 text-xs"
                      />
                      <span className="truncate text-xs text-fg-3">{ch?.title}</span>
                      {m.untrusted ? <UntrustedBadge /> : null}
                      {m.viaVictor ? (
                        <Badge tone="accent">
                          <Send /> {t("disp.sentVia")}
                        </Badge>
                      ) : null}
                      <time className="num ml-auto font-mono text-xs text-fg-3" dateTime={m.sentAt}>
                        {clock(m.sentAt)}
                      </time>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{m.text}</p>
                  {marks.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {marks.map((x, i) =>
                        x.type === "task" ? (
                          <Badge key={i} tone="accent" title={t("disp.createdTask")}>
                            <ListTodo /> {pick(x.label, lang)}
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
