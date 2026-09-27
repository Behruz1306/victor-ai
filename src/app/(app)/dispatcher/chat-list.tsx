"use client";

import * as React from "react";
import {
  MessageSquareReply,
  Truck,
  Clock,
  Frown,
  MessageSquareWarning,
  CalendarX,
} from "lucide-react";
import { useT } from "@/components/providers";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { Avatar, ChatTypeIcon, severityLevel } from "@/components/common";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import type { OverviewCustomer } from "./types";

// Chat badges: severity tone + icon + text; "ask fleet" is an action, not a severity → neutral.
const BADGES: Record<string, { key: TKey; tone: BadgeTone; icon: React.ReactNode; rank: number }> =
  {
    complaint: { key: "badge.complaint", tone: "critical", icon: <Frown />, rank: 0 },
    overdue: { key: "badge.overdue", tone: "critical", icon: <Clock />, rank: 1 },
    reply_now: { key: "badge.reply_now", tone: "high", icon: <MessageSquareReply />, rank: 2 },
    tone: { key: "badge.tone", tone: "high", icon: <MessageSquareWarning />, rank: 3 },
    no_deadline: { key: "badge.no_deadline", tone: "medium", icon: <CalendarX />, rank: 4 },
    ask_fleet: { key: "badge.ask_fleet", tone: "neutral", icon: <Truck />, rank: 5 },
  };

export function ChatBadge({ badge }: { badge: string }) {
  const { t } = useT();
  const b = BADGES[badge];
  if (!b) return null;
  return (
    <Badge tone={b.tone} data-testid={`badge-${badge}`}>
      {b.icon}
      {t(b.key)}
    </Badge>
  );
}

const DOT: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
};

function useShortTime(timezone: string) {
  const { lang } = useT();
  return React.useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const loc = lang === "ru" ? "ru-RU" : "en-US";
      const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(x);
      return day(d) === day(new Date())
        ? new Intl.DateTimeFormat(loc, {
            timeZone: timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(d)
        : new Intl.DateTimeFormat(loc, { timeZone: timezone, weekday: "short" }).format(d);
    },
    [lang, timezone],
  );
}

export function ChatList({
  customers,
  selectedCustomer,
  selectedChannel,
  onSelect,
  timezone,
  freshIds,
}: {
  customers: OverviewCustomer[];
  selectedCustomer: string | null;
  selectedChannel: string | null;
  onSelect: (customerId: string, channelId: string | null) => void;
  timezone: string;
  freshIds: Set<string>;
}) {
  const { t } = useT();
  const time = useShortTime(timezone);
  return (
    <nav aria-label={t("disp.title")} className="flex flex-col">
      {customers.map((c) => {
        const selected = selectedCustomer === c.id;
        const badges = [...new Set(c.channels.flatMap((ch) => ch.badges))].sort(
          (a, b) => (BADGES[a]?.rank ?? 9) - (BADGES[b]?.rank ?? 9),
        );
        const latest = [...c.channels]
          .filter((ch) => ch.last)
          .sort((a, b) => new Date(b.last!.at).getTime() - new Date(a.last!.at).getTime())[0];
        const unread = c.channels.reduce((a, ch) => a + ch.unread, 0);
        return (
          <section
            key={c.id}
            className={cn("border-b last:border-b-0", selected && "bg-surface-2/60")}
          >
            <button
              onClick={() => onSelect(c.id, c.channels[0]?.id ?? null)}
              className={cn(
                "relative flex w-full gap-3 px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-surface-2",
                selected && "hover:bg-surface-2/60",
                freshIds.has(c.id) && "animate-glow",
              )}
              aria-current={selected ? "true" : undefined}
              data-testid={`customer-${c.name}`}
            >
              {selected ? (
                <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 bg-accent" />
              ) : null}
              <Avatar name={c.name} size={32} className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-base font-semibold text-fg">{c.name}</span>
                  {unread ? (
                    <span
                      className="num rounded-full bg-accent px-1.5 text-xs leading-4 font-semibold text-accent-fg"
                      aria-label={`${unread} unread`}
                    >
                      {unread}
                    </span>
                  ) : null}
                  {latest?.last ? (
                    <span
                      className="num ml-auto shrink-0 font-mono text-xs text-fg-3"
                      suppressHydrationWarning
                    >
                      {time(latest.last.at)}
                    </span>
                  ) : null}
                </span>
                {latest?.last ? (
                  <span className="line-clamp-1 text-sm text-fg-3">
                    <span className="text-fg-2">
                      {latest.last.sender?.split(/[(|]/)[0]?.trim()}:
                    </span>{" "}
                    {latest.last.text}
                  </span>
                ) : null}
                {badges.length ? (
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {badges.slice(0, 3).map((b) => (
                      <ChatBadge key={b} badge={b} />
                    ))}
                    {badges.length > 3 ? (
                      <Badge
                        tone="neutral"
                        title={badges
                          .slice(3)
                          .map((b) => t(BADGES[b]!.key))
                          .join(", ")}
                      >
                        +{badges.length - 3}
                      </Badge>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </button>
            {selected ? (
              <ul
                className="flex flex-col pb-2"
                aria-label={t("disp.chatsCount", { n: c.channels.length })}
              >
                {c.channels.map((ch) => {
                  const active = selectedChannel === ch.id;
                  return (
                    <li key={ch.id}>
                      <button
                        onClick={() => onSelect(c.id, ch.id)}
                        className={cn(
                          "flex h-8 w-full items-center gap-2 pr-4 pl-[60px] text-left text-sm transition-colors",
                          active ? "font-medium text-fg" : "text-fg-2 hover:text-fg",
                        )}
                        aria-current={active ? "true" : undefined}
                        data-testid={`chat-${ch.title}`}
                      >
                        <ChatTypeIcon
                          type={ch.chatType}
                          className={active ? "text-accent-text" : "text-fg-3"}
                        />
                        <span className="truncate">{ch.title}</span>
                        {ch.maxSeverity >= 3 ? (
                          <span
                            aria-label={t(`sev.${Math.min(5, ch.maxSeverity)}` as TKey)}
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              DOT[severityLevel(ch.maxSeverity)],
                            )}
                          />
                        ) : null}
                        {ch.unread > 0 ? (
                          <span className="num ml-auto rounded-full bg-accent px-1.5 text-xs leading-4 font-semibold text-accent-fg">
                            {ch.unread}
                          </span>
                        ) : ch.last ? (
                          <span
                            className="num ml-auto font-mono text-xs text-fg-3"
                            suppressHydrationWarning
                          >
                            {time(ch.last.at)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}
