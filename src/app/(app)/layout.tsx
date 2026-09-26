import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/guard";
import { getLang } from "@/lib/i18n/server";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await currentUser();
  if (!ctx) redirect("/login");
  const lang = await getLang();
  return (
    <AppShell ctx={ctx} lang={lang}>
      {children}
    </AppShell>
  );
}
