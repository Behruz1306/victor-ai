"use client";

import { Toaster as Sonner } from "sonner";

/** App toasts (sonner), styled with the design tokens; one elevation, 14 px radius. */
export function Toaster({ theme }: { theme: "light" | "dark" }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-xl border bg-surface px-4 py-3 text-fg shadow-pop",
          title: "text-base font-medium",
          description: "mt-0.5 text-sm text-fg-2",
          icon: "mt-0.5 [&_svg]:size-4",
          success: "[&_[data-icon]]:text-ok",
          error: "border-critical-border [&_[data-icon]]:text-critical",
          actionButton: "ml-auto rounded-md bg-accent px-2 py-1 text-sm font-medium text-accent-fg",
        },
      }}
    />
  );
}
