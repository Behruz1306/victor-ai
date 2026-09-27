import * as React from "react";
import { cn } from "@/lib/utils";

export type Illustration = "calm" | "chats" | "tasks" | "rules" | "chart" | "search" | "sources";

// Original line illustrations: 1.5 px strokes in the tertiary text color, one accent detail.
function Art({ kind }: { kind: Illustration }) {
  const base = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const accent = { ...base, stroke: "var(--accent)" };
  switch (kind) {
    case "calm":
      return (
        <>
          <rect x="18" y="22" width="60" height="38" rx="7" {...base} opacity={0.35} />
          <rect x="12" y="16" width="60" height="38" rx="7" {...base} opacity={0.6} />
          <rect x="6" y="10" width="60" height="38" rx="7" {...base} />
          <path d="M25 29l6 6 12-12" {...accent} strokeWidth={2} />
        </>
      );
    case "chats":
      return (
        <>
          <path
            d="M10 14h40a6 6 0 016 6v16a6 6 0 01-6 6H26l-9 7v-7h-7a6 6 0 01-6-6V20a6 6 0 016-6z"
            {...base}
          />
          <path
            d="M62 30h18a6 6 0 016 6v12a6 6 0 01-6 6h-4v6l-8-6h-6a6 6 0 01-6-6"
            {...base}
            opacity={0.55}
          />
          <path d="M16 26h28M16 33h18" {...base} opacity={0.6} />
          <circle cx="50" cy="12" r="4" {...accent} />
        </>
      );
    case "tasks":
      return (
        <>
          <path d="M10 18h58M10 36h58M10 54h58" {...base} opacity={0.45} />
          <circle cx="16" cy="18" r="4" {...base} />
          <circle cx="16" cy="36" r="4" {...base} />
          <circle cx="16" cy="54" r="4" {...accent} />
          <path d="M14 54l1.5 1.5L18.5 52" {...accent} />
          <path d="M28 18h24M28 36h30M28 54h18" {...base} strokeWidth={2.5} opacity={0.8} />
        </>
      );
    case "rules":
      return (
        <>
          <path d="M14 12h34a6 6 0 016 6v44H20a6 6 0 01-6-6z" {...base} />
          <path d="M14 56a6 6 0 016-6h34" {...base} />
          <path d="M24 24h20M24 31h14" {...base} opacity={0.6} />
          <path d="M66 18l2.2 5 5 2.2-5 2.2L66 32.4l-2.2-5-5-2.2 5-2.2z" {...accent} />
        </>
      );
    case "chart":
      return (
        <>
          <path d="M8 60h76" {...base} opacity={0.5} />
          <path d="M8 50l14-10 12 6 14-18 12 8 16-20" {...accent} strokeWidth={2} />
          <path d="M8 60V14" {...base} opacity={0.5} />
          <circle cx="76" cy="16" r="3" {...accent} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="38" cy="32" r="18" {...base} />
          <path d="M51 45l14 14" {...base} strokeWidth={2.5} />
          <path d="M31 32h14" {...accent} strokeWidth={2} />
        </>
      );
    case "sources":
      return (
        <>
          <rect x="8" y="12" width="26" height="18" rx="4" {...base} />
          <rect x="8" y="40" width="26" height="18" rx="4" {...base} opacity={0.6} />
          <rect x="58" y="26" width="28" height="18" rx="4" {...accent} />
          <path d="M34 21c12 0 12 14 24 14M34 49c12 0 12-14 24-14" {...base} opacity={0.7} />
        </>
      );
  }
}

export function EmptyIllustration({ kind, className }: { kind: Illustration; className?: string }) {
  return (
    <svg viewBox="0 0 92 70" className={cn("h-[70px] w-[92px] text-fg-3", className)} aria-hidden>
      <Art kind={kind} />
    </svg>
  );
}

export function EmptyState({
  illustration = "calm",
  icon,
  title,
  hint,
  className,
  children,
}: {
  illustration?: Illustration;
  /** Legacy: ignored in favour of the illustration. */
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  void icon;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <EmptyIllustration kind={illustration} />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-medium text-fg">{title}</p>
        {hint ? <p className="text-sm text-fg-3">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
