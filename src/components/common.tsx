"use client";

import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CircleAlert,
  ShieldAlert,
  Send,
  MessageSquare,
  Phone,
  Mail,
  FlaskConical,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { useT } from "@/components/providers";
import { formatAgo, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CHAT_COLORS: Record<string, string> = {
  customer: "text-chip-customer border-chip-customer/40",
  internal: "text-chip-internal border-chip-internal/40",
  fleet: "text-chip-fleet border-chip-fleet/40",
  billing: "text-chip-billing border-chip-billing/40",
  support: "text-chip-support border-chip-support/40",
};

export function ChatTypeChip({ type, className }: { type: string | null; className?: string }) {
  const { t } = useT();
  const key = (type ? `chat.${type}` : "chat.unmapped") as TKey;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold tracking-wide uppercase",
        type ? CHAT_COLORS[type] : "border-dashed text-muted-foreground",
        className,
      )}
    >
      {t(key)}
    </span>
  );
}

export function sevTone(severity: number): "sev5" | "sev4" | "sev3" | "sev2" {
  if (severity >= 5) return "sev5";
  if (severity >= 4) return "sev4";
  if (severity >= 3) return "sev3";
  return "sev2";
}

export function SeverityIcon({ severity, className }: { severity: number; className?: string }) {
  const Icon =
    severity >= 5
      ? AlertOctagon
      : severity >= 4
        ? AlertTriangle
        : severity >= 3
          ? CircleAlert
          : Info;
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />;
}

/** Severity is always color + icon + text. */
export function SeverityBadge({ severity, label }: { severity: number; label?: string }) {
  const { t } = useT();
  return (
    <Badge tone={sevTone(severity)}>
      <SeverityIcon severity={severity} />
      {label ?? t(`sev.${Math.max(1, Math.min(5, severity))}` as TKey)}
    </Badge>
  );
}

export function SignalBadge({ kind, severity }: { kind: string; severity: number }) {
  const { t } = useT();
  return (
    <Badge tone={sevTone(severity)}>
      <SeverityIcon severity={severity} />
      {t(`signal.${kind}` as TKey)}
    </Badge>
  );
}

export function UntrustedBadge() {
  const { t } = useT();
  return (
    <Badge tone="sev4" title={t("disp.untrusted")}>
      <ShieldAlert /> {t("disp.flag")}
    </Badge>
  );
}

export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const Icon =
    source === "telegram"
      ? Send
      : source === "email"
        ? Mail
        : source === "call"
          ? Phone
          : source === "demo"
            ? FlaskConical
            : MessageSquare;
  return <Icon className={cn("size-3.5 text-muted-foreground", className)} aria-label={source} />;
}

export function TimeAgo({ date }: { date: string | Date }) {
  const { lang } = useT();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(force, 30_000);
    return () => clearInterval(id);
  }, []);
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()} suppressHydrationWarning>
      {formatAgo(lang, d)}
    </time>
  );
}

export function useClock(timezone: string) {
  const { lang } = useT();
  return React.useCallback(
    (date: string | Date, withDay = false) =>
      new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
      }).format(typeof date === "string" ? new Date(date) : date),
    [lang, timezone],
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

export function DemoDataTag() {
  const { t } = useT();
  return (
    <span className="rounded border border-dashed border-sev-3/60 px-1 py-px text-[10px] font-medium text-sev-3">
      {t("common.demoData")}
    </span>
  );
}
