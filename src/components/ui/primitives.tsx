import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border bg-surface text-fg", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-fg", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-fg-3", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

const field =
  "w-full rounded-md border border-border-strong bg-surface text-base text-fg placeholder:text-fg-3 transition-[border-color,box-shadow] duration-[120ms] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, "h-9 px-3", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(field, "min-h-20 px-3 py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, "h-9 px-2.5", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg-2", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton h-4", className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export type BadgeTone =
  | "neutral"
  | "accent"
  | "primary"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "ok"
  | "sev5"
  | "sev4"
  | "sev3"
  | "sev2"
  | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-fg-2 border-transparent",
  accent: "bg-accent-soft text-accent-text border-transparent",
  primary: "bg-accent-soft text-accent-text border-transparent",
  critical: "bg-critical-soft text-critical border-critical-border",
  high: "bg-high-soft text-high border-high-border",
  medium: "bg-medium-soft text-medium border-medium-border",
  low: "bg-low-soft text-low border-low-border",
  ok: "bg-ok-soft text-ok border-ok-border",
  sev5: "bg-critical-soft text-critical border-critical-border",
  sev4: "bg-high-soft text-high border-high-border",
  sev3: "bg-medium-soft text-medium border-medium-border",
  sev2: "bg-low-soft text-low border-low-border",
  outline: "bg-transparent text-fg-2 border-border-strong",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface px-1 font-mono text-xs text-fg-2 shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-critical-border bg-critical-soft px-3 py-2 text-sm text-critical"
    >
      <span>{message}</span>
      {onRetry ? (
        <button className="text-sm font-medium underline underline-offset-2" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </button>
      ) : null}
    </div>
  );
}

/** Page header: title, one line of context, the primary action. */
export function PageHeader({
  title,
  context,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  context?: React.ReactNode;
  /** Alias of context (older call sites). */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const line = context ?? subtitle;
  return (
    <header
      className={cn("mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        {line ? <p className="mt-1 text-base text-fg-3">{line}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Small uppercase label above a group inside a pane. */
export function SectionLabel({
  className,
  children,
  aside,
}: {
  className?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-1", className)}>
      <h2 className="text-xs font-medium tracking-[0.04em] text-fg-3 uppercase">{children}</h2>
      {aside}
    </div>
  );
}

// Kept for older call sites; new code uses components/empty-state.
export { EmptyState } from "@/components/empty-state";
