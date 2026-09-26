import { requirePage } from "@/lib/auth/guard";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { PageHeader, EmptyState } from "@/components/ui/primitives";

export default async function Page() {
  await requirePage("view:sources");
  const lang = await getLang();
  return (
    <div>
      <PageHeader title={t(lang, "src.title")} />
      <EmptyState title={t(lang, "common.loading")} />
    </div>
  );
}
