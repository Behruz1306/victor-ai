"use client";

import * as React from "react";
import {
  OctagonAlert,
  TriangleAlert,
  CircleAlert,
  Info,
  CircleCheck,
  ShieldAlert,
  Send,
  MessageSquare,
  Phone,
  Mail,
  FlaskConical,
  Handshake,
  Users,
  Truck,
  ReceiptText,
  LifeBuoy,
  CircleDashed,
  CornerDownRight,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { useT } from "@/components/providers";
import { formatAgo, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ── Severity: always color + icon + text ─────────────────────────────────────────────────────

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "ok";

export function severityLevel(severity: number): SeverityLevel {
  if (severity >= 5) return "critical";
  if (severity >= 4) return "high";
  if (severity >= 3) return "medium";
  return "low";
}

/** Legacy tone names used by older call sites. */
export function sevTone(severity: number): "sev5" | "sev4" | "sev3" | "sev2" {
  if (severity >= 5) return "sev5";
  if (severity >= 4) return "sev4";
  if (severity >= 3) return "sev3";
  return "sev2";
}

const LEVEL_ICON: Record<SeverityLevel, typeof Info> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: Info,
  ok: CircleCheck,
};

export function SeverityIcon({
  severity,
  level,
  className,
}: {
  severity?: number;
  level?: SeverityLevel;
  className?: string;
}) {
  const Icon = LEVEL_ICON[level ?? severityLevel(severity ?? 2)];
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />;
}

const LEVEL_KEY: Record<SeverityLevel, TKey> = {
  critical: "sev.5",
  high: "sev.4",
  medium: "sev.3",
  low: "sev.2",
  ok: "sev.ok" as TKey,
};

export function SeverityBadge({
  severity,
  level,
  label,
  className,
}: {
  severity?: number;
  level?: SeverityLevel;
  label?: string;
  className?: string;
}) {
  const { t } = useT();
  const l = level ?? severityLevel(severity ?? 2);
  return (
    <Badge tone={l as BadgeTone} className={className} data-severity={l}>
      <SeverityIcon level={l} />
      {label ?? t(LEVEL_KEY[l])}
    </Badge>
  );
}

/** A signal kind ("Complaint", "Overdue") in its severity's color, with its severity icon. */
export function SignalBadge({
  kind,
  severity,
  className,
}: {
  kind: string;
  severity: number;
  className?: string;
}) {
  const { t } = useT();
  const l = severityLevel(severity);
  return (
    <Badge tone={l as BadgeTone} className={className} title={t(LEVEL_KEY[l])}>
      <SeverityIcon level={l} />
      {t(`signal.${kind}` as TKey)}
    </Badge>
  );
}

// ── Chat types: neutral chip, distinct icon ─────────────────────────────────────────────────

const CHAT_ICON: Record<string, typeof Users> = {
  customer: Handshake,
  internal: Users,
  fleet: Truck,
  billing: ReceiptText,
  support: LifeBuoy,
};

export function ChatTypeIcon({ type, className }: { type: string | null; className?: string }) {
  const Icon = (type && CHAT_ICON[type]) || CircleDashed;
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />;
}

export function ChatTypeChip({
  type,
  className,
  compact = false,
}: {
  type: string | null;
  className?: string;
  /** Icon only (the label stays available to screen readers and on hover). */
  compact?: boolean;
}) {
  const { t } = useT();
  const label = t((type ? `chat.${type}` : "chat.unmapped") as TKey);
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium text-fg-2",
        type ? "border-border bg-surface-2" : "border-dashed border-border-strong text-fg-3",
        compact && "px-1",
        className,
      )}
      data-chat-type={type ?? "unmapped"}
    >
      <ChatTypeIcon type={type} className="size-3" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

// ── People ──────────────────────────────────────────────────────────────────────────────────

// Muted, theme-safe hues; the hue is a pure function of the name.
const AVATAR_HUES = [262, 222, 196, 168, 142, 32, 12, 330, 292, 48];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const words = name
    .replace(/[(|].*$/, "")
    .trim()
    .split(/[\s\-–]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: 20 | 24 | 28 | 32 | 36 | 40;
  className?: string;
}) {
  const hue = AVATAR_HUES[hash(name) % AVATAR_HUES.length]!;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold select-none",
        "bg-[oklch(0.94_0.035_var(--h))] text-[oklch(0.38_0.09_var(--h))] dark:bg-[oklch(0.3_0.05_var(--h))] dark:text-[oklch(0.88_0.06_var(--h))]",
        className,
      )}
      style={
        {
          "--h": hue,
          width: size,
          height: size,
          fontSize: size <= 24 ? 10 : size <= 32 ? 11 : 13,
        } as React.CSSProperties
      }
    >
      {initials(name)}
    </span>
  );
}

// ── Evidence ────────────────────────────────────────────────────────────────────────────────

export function EvidenceQuote({
  text,
  chatType,
  chatTitle,
  sender,
  at,
  href,
  timezone,
  clamp = 3,
  className,
}: {
  text: string;
  chatType?: string | null;
  chatTitle?: string | null;
  sender?: string | null;
  at?: string | Date | null;
  href?: string | null;
  timezone?: string;
  clamp?: 2 | 3 | 4 | 6;
  className?: string;
}) {
  const clock = useClock(timezone ?? "America/Chicago");
  const body = (
    <>
      <p
        className={cn(
          "text-sm leading-snug text-fg",
          clamp === 2 && "line-clamp-2",
          clamp === 3 && "line-clamp-3",
          clamp === 4 && "line-clamp-4",
          clamp === 6 && "line-clamp-6",
        )}
      >
        “{text}”
      </p>
      {chatTitle || sender || at ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-3">
          {chatType !== undefined ? (
            <ChatTypeIcon type={chatType ?? null} className="size-3" />
          ) : null}
          {chatTitle ? <span className="max-w-full truncate">{chatTitle}</span> : null}
          {sender ? (
            <>
              <span aria-hidden>·</span>
              <span className="max-w-full truncate">{sender.replace(/[(|].*$/, "").trim()}</span>
            </>
          ) : null}
          {at ? (
            <>
              <span aria-hidden>·</span>
              <time
                className="num font-mono whitespace-nowrap"
                dateTime={new Date(at).toISOString()}
              >
                {clock(at, true)}
              </time>
            </>
          ) : null}
          {href ? <CornerDownRight className="ml-auto size-3 shrink-0" aria-hidden /> : null}
        </div>
      ) : null}
    </>
  );
  const cls = cn(
    "block rounded-md border-l-2 border-border-strong bg-surface-2 px-3 py-2",
    href && "transition-colors hover:border-accent hover:bg-surface-3",
    className,
  );
  return href ? (
    <a href={href} className={cls} data-testid="evidence-quote">
      {body}
    </a>
  ) : (
    <blockquote className={cls} data-testid="evidence-quote">
      {body}
    </blockquote>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────────────────────

export function UntrustedBadge() {
  const { t } = useT();
  return (
    <Badge tone="high" title={t("disp.untrusted")}>
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
  return <Icon className={cn("size-3.5 text-fg-3", className)} aria-label={source} />;
}

export function TimeAgo({ date, className }: { date: string | Date; className?: string }) {
  const { lang } = useT();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(force, 30_000);
    return () => clearInterval(id);
  }, []);
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time
      dateTime={d.toISOString()}
      title={d.toLocaleString()}
      className={cn("num", className)}
      suppressHydrationWarning
    >
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

/** Skeleton rows for any list while it loads. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-3", className)} aria-busy aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton size-7 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="skeleton h-3 w-2/5" />
            <div className="skeleton h-3 w-4/5" style={{ opacity: 0.7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DemoDataTag({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border border-dashed border-medium-border px-1.5 text-xs font-medium text-medium",
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden />
      {t("common.demoData")}
    </span>
  );
}

/** Breathing dot for "live". */
export function LiveDot({ on = true, className }: { on?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        on ? "animate-live bg-ok" : "bg-fg-3/60",
        className,
      )}
    />
  );
}

/** Number that ticks to its new value (instant with reduced motion). */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 400);
      const eased = 1 - (1 - p) ** 3;
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("num", className)}>{format(shown)}</span>;
}
