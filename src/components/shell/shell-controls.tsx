"use client";

import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useT, useTheme } from "@/components/providers";
import { LANG_COOKIE } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** EN / RU segmented switch (login and landing). */
export function LangToggle({ className }: { className?: string }) {
  const { lang, t } = useT();
  const router = useRouter();
  const set = (next: "en" | "ru") => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div
      role="group"
      aria-label={t("shell.lang")}
      className={cn("flex h-8 items-center rounded-md border bg-surface p-0.5 text-xs font-medium", className)}
      data-testid="lang-toggle"
    >
      {(["en", "ru"] as const).map((l) => (
        <button
          key={l}
          onClick={() => set(l)}
          aria-pressed={lang === l}
          className={cn(
            "h-full rounded px-2 uppercase transition-colors",
            lang === l ? "bg-surface-2 text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { theme, setTheme } = useTheme();
  return (
    <button
      className={cn(
        "grid size-8 place-items-center rounded-md border bg-surface text-fg-2 hover:bg-surface-2 hover:text-fg",
        className,
      )}
      aria-label={t("shell.theme")}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
