"use client";

import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { EmptyIllustration } from "@/components/empty-state";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <EmptyIllustration kind="search" />
      <div>
        <p className="text-lg font-semibold text-fg">{t("common.errorTitle")}</p>
        <p className="mt-1 text-sm text-fg-3">{t("common.error")}</p>
      </div>
      <Button variant="outline" onClick={reset}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
