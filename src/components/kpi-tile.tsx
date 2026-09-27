"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { AnimatedNumber } from "@/components/common";
import { cn } from "@/lib/utils";

/** Quiet sparkline: neutral stroke, the latest point in the accent. */
export function Sparkline({
  points,
  className,
  height = 28,
  width = 96,
}: {
  points: number[];
  className?: string;
  height?: number;
  width?: number;
}) {
  if (points.length < 2)
    return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const last = points.at(-1)!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="var(--surface-2)" />
      <path
        d={d}
        fill="none"
        stroke="var(--fg-3)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={width} cy={y(last)} r={2.5} fill="var(--accent)" />
    </svg>
  );
}

export type KpiDelta = {
  /** Change vs the previous period, in the tile's unit. */
  value: number;
  /** Which direction is good. */
  better: "up" | "down";
  label: string;
  format?: (n: number) => string;
};

export function KpiTile({
  label,
  icon,
  value,
  format,
  emptyText = "—",
  delta,
  series,
  context,
  tone = "default",
  testId,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number | null;
  format?: (n: number) => string;
  emptyText?: string;
  delta?: KpiDelta | null;
  series?: number[];
  context?: React.ReactNode;
  tone?: "default" | "critical";
  testId?: string;
  className?: string;
}) {
  const good = delta ? (delta.better === "up" ? delta.value > 0 : delta.value < 0) : false;
  const flat = delta ? Math.abs(delta.value) < 1e-9 : true;
  const Arrow = flat ? Minus : delta && delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  const fmtDelta = delta?.format ?? ((n: number) => String(Math.round(n)));
  const sign = delta && !flat ? (delta.value > 0 ? "+" : "−") : "";
  return (
    <section
      className={cn("kpi-tile rounded-lg border bg-surface", className)}
      data-testid={testId}
      aria-label={label}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg-2 [grid-area:label] [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-3">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "text-2xl font-semibold whitespace-nowrap text-fg [grid-area:value] sm:text-3xl",
          tone === "critical" && value ? "text-critical" : "",
        )}
      >
        {value === null ? (
          <span className="text-base font-normal text-fg-3 sm:text-xl">{emptyText}</span>
        ) : (
          <AnimatedNumber value={value} format={format} />
        )}
      </div>
      <div className="self-end [grid-area:spark]">
        {series && series.length > 1 ? <Sparkline points={series} className="mb-1" width={80} /> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-3 [grid-area:meta]">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              flat ? "text-fg-3" : good ? "text-ok" : "text-critical",
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            <span className="num">
              {sign}
              {flat ? "0" : fmtDelta(Math.abs(delta.value))}
            </span>
            <span className="font-normal text-fg-3">{delta.label}</span>
          </span>
        ) : null}
        {context ? <span className="min-w-0">{context}</span> : null}
      </div>
    </section>
  );
}
