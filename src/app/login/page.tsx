import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UserCheck, Lock } from "lucide-react";
import { currentUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { BRAND } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { LogoMark, Wordmark } from "@/components/brand";
import { FlowArt } from "@/components/flow-art";
import { LoginForm } from "./login-form";
import { LangToggle, ThemeToggle } from "@/components/shell/shell-controls";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const ctx = await currentUser();
  if (ctx) redirect(homeFor(ctx.role));
  const lang = await getLang();
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Left: the promise. Always the dark palette. */}
      <section className="dark relative hidden overflow-hidden border-r bg-bg text-fg lg:grid lg:grid-rows-[auto_auto_minmax(0,1fr)_auto] lg:gap-10 lg:p-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label={BRAND.name}>
          <LogoMark size={28} />
          <Wordmark className="text-lg" />
        </Link>
        <div className="max-w-[480px] pt-[6vh]">
          <p className="text-3xl font-semibold text-fg">{BRAND.tagline[lang]}</p>
          <p className="mt-4 text-lg text-fg-2">{BRAND.ownerPromise[lang]}</p>
        </div>
        <FlowArt className="h-full max-h-[360px] w-full self-center text-fg" />
        <ul className="flex flex-col gap-2 text-sm text-fg-2">
          <li className="flex items-center gap-2">
            <UserCheck className="size-4 text-fg-3" aria-hidden /> {t(lang, "login.trust1")}
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-fg-3" aria-hidden /> {t(lang, "login.trust2")}
          </li>
          <li className="flex items-center gap-2">
            <Lock className="size-4 text-fg-3" aria-hidden /> {t(lang, "login.trust3")}
          </li>
        </ul>
      </section>

      {/* Right: sign in. */}
      <section className="flex flex-col bg-bg">
        <div className="flex items-center justify-between gap-2 p-4 sm:p-6">
          <Link href="/" className="flex items-center gap-2 lg:invisible" aria-label={BRAND.name}>
            <LogoMark size={24} />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-4 pb-16">
          <h1 className="text-2xl font-semibold text-fg">{t(lang, "login.heading")}</h1>
          <p className="mt-1.5 mb-8 text-base text-fg-3">{t(lang, "login.subtitle")}</p>
          <LoginForm demoMode={env().demoMode} />
          <p className="mt-10 text-sm text-fg-3 lg:hidden">{BRAND.tagline[lang]}</p>
        </div>
      </section>
    </div>
  );
}
