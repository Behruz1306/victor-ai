import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { currentUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { BRAND } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";
import { LangToggle, ThemeToggle } from "@/components/shell/shell-controls";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const ctx = await currentUser();
  if (ctx) redirect(homeFor(ctx.role));
  const lang = await getLang();
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end gap-1 p-3">
        <LangToggle />
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-24">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          <div>
            <div className="text-xl font-semibold tracking-tight">{BRAND.name}</div>
            <div className="text-xs text-muted-foreground">{t(lang, "login.subtitle")}</div>
          </div>
        </div>
        <LoginForm demoMode={env().demoMode} />
        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">{BRAND.tagline[lang]}</p>
      </div>
    </div>
  );
}
