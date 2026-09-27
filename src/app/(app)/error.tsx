"use client";

import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">{t("common.error")}</p>
      <Button variant="outline" size="sm" onClick={reset}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
