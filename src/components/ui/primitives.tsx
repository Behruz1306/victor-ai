import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border bg-card text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/70",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm", className)}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "sev5" | "sev4" | "sev3" | "sev2" | "ok" | "outline";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
    sev5: "bg-sev-5-soft text-sev-5",
    sev4: "bg-sev-4-soft text-sev-4",
    sev3: "bg-sev-3-soft text-sev-3",
    sev2: "bg-sev-2-soft text-sev-2",
    ok: "bg-ok-soft text-ok",
    outline: "border border-border text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  className,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground/70 [&_svg]:size-6">{icon}</div> : null}
      <p className="font-medium text-foreground/80">{title}</p>
      {hint ? <p className="max-w-md text-xs">{hint}</p> : null}
      {children}
    </div>
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-sev-5/30 bg-sev-5-soft px-3 py-2 text-sm text-sev-5">
      <span>{message}</span>
      {onRetry ? (
        <button className="text-xs font-medium underline" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
