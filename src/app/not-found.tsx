import Link from "next/link";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function NotFound() {
  const lang = await getLang();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">{t(lang, "common.notFound")}</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        {t(lang, "common.back")}
      </Link>
    </div>
  );
}
