import Link from "next/link";
import { Activity } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { navFor } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import type { Ctx } from "@/lib/auth/guard";
import type { Lang } from "@/lib/types";
import { NavLinks, LangToggle, ThemeToggle, LogoutButton } from "./shell-controls";

export function AppShell({
  ctx,
  lang,
  children,
}: {
  ctx: Ctx;
  lang: Lang;
  children: React.ReactNode;
}) {
  const e = env();
  const items = navFor(ctx.role, e.demoMode).map((n) => ({ href: n.href, key: n.key }));
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3 px-3 sm:px-4">
          <Link href="/" className="flex items-center gap-1.5 pr-2 font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-3.5" />
            </span>
            <span className="hidden sm:inline">{BRAND.name}</span>
          </Link>
          <NavLinks items={items} />
          <div className="ml-auto flex items-center gap-1">
            {e.demoMode ? (
              <span className="mr-1 hidden rounded border border-dashed border-sev-3/60 px-1.5 py-0.5 text-[11px] font-medium text-sev-3 md:inline">
                {t(lang, "shell.demoBadge")}
              </span>
            ) : null}
            <LangToggle />
            <ThemeToggle />
            <div className="ml-1 hidden text-right leading-tight md:block">
              <div className="text-[13px] font-medium">{ctx.name}</div>
              <div className="text-[11px] text-muted-foreground">{t(lang, `role.${ctx.role}`)}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4">{children}</main>
    </div>
  );
}
