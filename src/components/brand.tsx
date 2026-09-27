import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

// Victor AI mark: a geometric "V" drawn as two strokes — a short one and a long rising one —
// so it also reads as a check mark: the task, done. Built on a 32 px grid; legible at 16 px
// and in one color.
export const MARK_PATHS = {
  left: "M8.6 14.2 L14.1 23.4",
  right: "M17.2 23.4 L24.2 9",
} as const;

export function LogoMark({
  size = 24,
  variant = "tile",
  className,
  title,
}: {
  size?: number;
  variant?: "tile" | "mono";
  className?: string;
  title?: string;
}) {
  const tile = variant === "tile";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {tile ? <rect width="32" height="32" rx="8" fill="var(--accent)" /> : null}
      <g
        fill="none"
        stroke={tile ? "var(--accent-fg)" : "currentColor"}
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARK_PATHS.left} />
        <path d={MARK_PATHS.right} />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-[-0.02em] text-fg", className)}>
      Victor<span className="font-medium text-fg-3"> AI</span>
    </span>
  );
}

export function Logo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} title={BRAND.name} />
      <Wordmark />
    </span>
  );
}
