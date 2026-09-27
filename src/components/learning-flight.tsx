"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck } from "lucide-react";

export type Flight = { id: number; from: DOMRect; title: string; rule: string };

/**
 * The learning moment: a small "New rule learned" card rises from the suggestion, holds for a
 * beat, then flies into the Playbook nav item, which glows once. Skipped (the toast alone
 * stays) with prefers-reduced-motion or when the nav item is not on screen.
 */
export function LearningFlight({ flight, onDone }: { flight: Flight | null; onDone: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!flight) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const target = document.querySelector<HTMLElement>('[data-nav="playbook"]');
    const tr = target?.getBoundingClientRect();
    const el = ref.current;
    if (reduce || !el || !tr || tr.width === 0) {
      onDone();
      return;
    }
    const start = el.getBoundingClientRect();
    const dx = tr.left + tr.width / 2 - (start.left + start.width / 2);
    const dy = tr.top + tr.height / 2 - (start.top + start.height / 2);
    const anim = el.animate(
      [
        { transform: "translateY(8px) scale(0.96)", opacity: 0 },
        { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.12 },
        { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.62 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.2 },
      ],
      { duration: 2200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
    );
    anim.onfinish = () => {
      target!.animate(
        [
          {
            boxShadow: "0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent)",
            backgroundColor: "var(--accent-soft)",
          },
          { boxShadow: "0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent)" },
        ],
        { duration: 1100, easing: "ease-out" },
      );
      onDone();
    };
    return () => anim.cancel();
  }, [flight, onDone]);

  if (!flight || typeof document === "undefined") return null;
  const width = Math.min(360, flight.from.width);
  return createPortal(
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-[60] flex items-start gap-2 rounded-lg border border-ok-border bg-surface px-3 py-2.5 shadow-pop"
      style={{
        left: flight.from.left + (flight.from.width - width) / 2,
        top: flight.from.top + 24,
        width,
      }}
    >
      <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-ok" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{flight.title}</div>
        <div className="line-clamp-2 text-xs text-fg-2">{flight.rule}</div>
      </div>
    </div>,
    document.body,
  );
}
