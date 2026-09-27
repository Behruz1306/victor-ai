"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { t as translate, type TKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { THEME_COOKIE } from "@/lib/brand";
import { TooltipProvider } from "@/components/ui/overlay";
import { Toaster } from "@/components/toaster";

type I18nCtx = { lang: Lang; t: (key: TKey, params?: Record<string, string | number>) => string };

const I18nContext = React.createContext<I18nCtx>({
  lang: "en",
  t: (key, params) => translate("en", key, params),
});

export function useT(): I18nCtx {
  return React.useContext(I18nContext);
}

type Theme = "light" | "dark";
const ThemeContext = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function Providers({
  lang,
  theme: initialTheme = "light",
  children,
}: {
  lang: Lang;
  theme?: Theme;
  children: React.ReactNode;
}) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1, staleTime: 1000 } },
      }),
  );
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);
  const setTheme = React.useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setThemeState(next);
  }, []);
  const i18n = React.useMemo<I18nCtx>(
    () => ({ lang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  );
  const themeCtx = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return (
    <QueryClientProvider client={client}>
      <I18nContext.Provider value={i18n}>
        <ThemeContext.Provider value={themeCtx}>
          <TooltipProvider delayDuration={350}>
            {children}
            <Toaster theme={theme} />
          </TooltipProvider>
        </ThemeContext.Provider>
      </I18nContext.Provider>
    </QueryClientProvider>
  );
}
