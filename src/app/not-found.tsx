import Link from "next/link";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { LogoMark } from "@/components/brand";
import { EmptyIllustration } from "@/components/empty-state";

export default async function NotFound() {
  const lang = await getLang();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <LogoMark size={32} />
      <EmptyIllustration kind="search" />
      <div>
        <p className="num font-mono text-sm text-fg-3">404</p>
        <p className="mt-1 text-xl font-semibold text-fg">{t(lang, "common.notFound")}</p>
      </div>
      <Link href="/" className="text-base font-medium text-accent-text hover:underline">
        {t(lang, "common.home")}
      </Link>
    </div>
  );
}
