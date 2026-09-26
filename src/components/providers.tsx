"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { t as translate, type TKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type I18nCtx = { lang: Lang; t: (key: TKey, params?: Record<string, string | number>) => string };

const I18nContext = React.createContext<I18nCtx>({
  lang: "en",
  t: (key, params) => translate("en", key, params),
});

export function useT(): I18nCtx {
  return React.useContext(I18nContext);
}

export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1, staleTime: 1000 } },
      }),
  );
  const i18n = React.useMemo<I18nCtx>(
    () => ({ lang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  );
  return (
    <QueryClientProvider client={client}>
      <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
    </QueryClientProvider>
  );
}
