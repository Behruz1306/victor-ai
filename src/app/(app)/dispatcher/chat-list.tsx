"use client";

import { MessageSquareReply, Truck, Clock, Frown, AlertCircle, CalendarX } from "lucide-react";
import { useT } from "@/components/providers";
import { Badge } from "@/components/ui/primitives";
import { ChatTypeChip, SourceIcon, TimeAgo } from "@/components/common";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import type { OverviewCustomer } from "./types";

const BADGES: Record<
  string,
  { key: TKey; tone: "sev5" | "sev4" | "sev3" | "sev2" | "primary"; icon: React.ReactNode }
> = {
  reply_now: { key: "badge.reply_now", tone: "sev4", icon: <MessageSquareReply /> },
  ask_fleet: { key: "badge.ask_fleet", tone: "primary", icon: <Truck /> },
  overdue: { key: "badge.overdue", tone: "sev5", icon: <Clock /> },
  complaint: { key: "badge.complaint", tone: "sev5", icon: <Frown /> },
  tone: { key: "badge.tone", tone: "sev4", icon: <AlertCircle /> },
  no_deadline: { key: "badge.no_deadline", tone: "sev3", icon: <CalendarX /> },
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

export function ChatList({
  customers,
  selectedCustomer,
  selectedChannel,
  onSelect,
}: {
  customers: OverviewCustomer[];
  selectedCustomer: string | null;
  selectedChannel: string | null;
  onSelect: (customerId: string, channelId: string | null) => void;
}) {
  const { t } = useT();
  return (
    <nav className="flex flex-col gap-3" aria-label={t("disp.title")}>
      {customers.map((c) => (
        <section
          key={c.id}
          className={cn(
            "rounded-lg border bg-card",
            selectedCustomer === c.id && "ring-1 ring-primary/40",
          )}
        >
          <button
            className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left"
            onClick={() => onSelect(c.id, null)}
            data-testid={`customer-${c.name}`}
          >
            <span className="truncate text-sm font-semibold">{c.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {t("disp.chatsCount", { n: c.channels.length })}
            </span>
          </button>
          <ul>
            {c.channels.map((ch) => (
              <li key={ch.id}>
                <button
                  onClick={() => onSelect(c.id, ch.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                    selectedChannel === ch.id && selectedCustomer === c.id && "bg-primary-soft/60",
                  )}
                  data-testid={`chat-${ch.title}`}
                >
                  <div className="flex items-center gap-1.5">
                    <SourceIcon source={ch.source} className="size-3" />
                    <span className="truncate text-[13px] font-medium">{ch.title}</span>
                    <ChatTypeChip type={ch.chatType} />
                    {ch.unread > 0 ? (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {ch.unread}
                      </span>
                    ) : ch.last ? (
                      <span className="ml-auto text-[10px] whitespace-nowrap text-muted-foreground">
                        <TimeAgo date={ch.last.at} />
                      </span>
                    ) : null}
                  </div>
                  {ch.last ? (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {ch.last.sender?.split(/[(|]/)[0]?.trim()}:
                      </span>{" "}
                      {ch.last.text}
                    </p>
                  ) : null}
                  {ch.badges.length ? (
                    <div className="flex flex-wrap gap-1">
                      {ch.badges.map((b) => (
                        <ChatBadge key={b} badge={b} />
                      ))}
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
