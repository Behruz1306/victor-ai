import Link from "next/link";
import {
  ArrowRight,
  MessagesSquare,
  Clock,
  TrendingDown,
  Cable,
  ScanSearch,
  ListChecks,
  BookOpenCheck,
  Gauge,
  UsersRound,
  Headset,
  UserCheck,
  ShieldCheck,
  Lock,
  Eraser,
  Building2,
  FileWarning,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { t, type TKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { LogoMark, Wordmark } from "@/components/brand";
import { FlowArt } from "@/components/flow-art";
import { LangToggle, ThemeToggle } from "@/components/shell/shell-controls";

const PROBLEMS: { icon: typeof Clock; title: TKey; body: TKey }[] = [
  { icon: MessagesSquare, title: "land.p1", body: "land.p1b" },
  { icon: Clock, title: "land.p2", body: "land.p2b" },
  { icon: TrendingDown, title: "land.p3", body: "land.p3b" },
];

const STEPS: { icon: typeof Cable; title: TKey; body: TKey }[] = [
  { icon: Cable, title: "land.s1", body: "land.s1b" },
  { icon: ScanSearch, title: "land.s2", body: "land.s2b" },
  { icon: ListChecks, title: "land.s3", body: "land.s3b" },
  { icon: BookOpenCheck, title: "land.s4", body: "land.s4b" },
];

const ROLES: { icon: typeof Gauge; title: TKey; body: TKey; sees: TKey }[] = [
  { icon: Gauge, title: "land.r1", body: "land.r1b", sees: "land.r1s" },
  { icon: UsersRound, title: "land.r2", body: "land.r2b", sees: "land.r2s" },
  { icon: Headset, title: "land.r3", body: "land.r3b", sees: "land.r3s" },
];

const TRUST: { icon: typeof Lock; title: TKey; body: TKey }[] = [
  { icon: UserCheck, title: "land.t1", body: "land.t1b" },
  { icon: ShieldCheck, title: "land.t2", body: "land.t2b" },
  { icon: FileWarning, title: "land.t3", body: "land.t3b" },
  { icon: Building2, title: "land.t4", body: "land.t4b" },
  { icon: Eraser, title: "land.t5", body: "land.t5b" },
  { icon: Lock, title: "land.t6", body: "land.t6b" },
];

export function Landing({ lang, theme }: { lang: Lang; theme: "light" | "dark" }) {
  const tr = (k: TKey) => t(lang, k);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2" aria-label={BRAND.name}>
            <LogoMark size={24} />
            <Wordmark />
          </Link>
          <nav
            className="hidden items-center gap-5 text-sm text-fg-2 md:flex"
            aria-label="Sections"
          >
            <a href="#how" className="hover:text-fg">
              {tr("land.navHow")}
            </a>
            <a href="#roles" className="hover:text-fg">
              {tr("land.navRoles")}
            </a>
            <a href="#security" className="hover:text-fg">
              {tr("land.navSecurity")}
            </a>
            <a href="#pricing" className="hover:text-fg">
              {tr("land.navPricing")}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle className="hidden sm:flex" />
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent/90"
              data-testid="landing-cta-top"
            >
              {tr("land.cta")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-[1200px] gap-10 px-4 pt-14 pb-10 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-sm text-fg-2">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              {tr("land.eyebrow")}
            </p>
            <h1 className="text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-fg sm:text-[44px]">
              {BRAND.tagline[lang]}
            </h1>
            <p className="mt-5 max-w-[520px] text-lg text-fg-2">{tr("land.sub")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-base font-medium text-accent-fg hover:bg-accent/90"
                data-testid="landing-cta"
              >
                {tr("land.cta")} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center rounded-md border bg-surface px-5 text-base font-medium text-fg hover:bg-surface-2"
              >
                {tr("land.howCta")}
              </a>
            </div>
            <p className="mt-4 text-sm text-fg-3">{tr("land.ctaNote")}</p>
          </div>
          <FlowArt className="hidden h-auto w-full text-fg lg:block" />
        </section>

        <section
          className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8"
          aria-label={tr("land.shotAlt")}
        >
          <figure className="overflow-hidden rounded-xl border bg-surface shadow-pop">
            <div className="flex h-8 items-center gap-1.5 border-b px-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-surface-3" />
              <span className="size-2.5 rounded-full bg-surface-3" />
              <span className="size-2.5 rounded-full bg-surface-3" />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot, sized, no optimizer needed */}
            <img
              src={theme === "dark" ? "/landing/dispatcher-dark.jpg" : "/landing/dispatcher.jpg"}
              alt={tr("land.shotAlt")}
              width={1440}
              height={900}
              className="block h-auto w-full"
              fetchPriority="high"
            />
          </figure>
          <figcaption className="mt-3 text-center text-sm text-fg-3">
            {tr("land.shotCaption")}
          </figcaption>
        </section>

        {/* Problem */}
        <section className="border-y bg-surface">
          <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-16 sm:px-8 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="flex flex-col gap-2">
                <p.icon className="size-5 text-fg-3" aria-hidden />
                <h2 className="text-lg font-semibold text-fg">{tr(p.title)}</h2>
                <p className="text-base text-fg-2">{tr(p.body)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-20 sm:px-8">
          <h2 className="text-2xl font-semibold text-fg">{tr("land.howTitle")}</h2>
          <p className="mt-2 max-w-[640px] text-base text-fg-2">{tr("land.howSub")}</p>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 bg-surface p-5">
                <span className="flex items-center justify-between">
                  <span className="num font-mono text-xs text-fg-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <s.icon className="size-5 text-accent-text" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-fg">{tr(s.title)}</span>
                <span className="text-sm text-fg-2">{tr(s.body)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Roles */}
        <section id="roles" className="border-y bg-surface">
          <div className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-20 sm:px-8">
            <h2 className="text-2xl font-semibold text-fg">{tr("land.rolesTitle")}</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {ROLES.map((r) => (
                <div key={r.title} className="flex flex-col gap-3 rounded-lg border bg-bg p-5">
                  <r.icon className="size-5 text-fg-3" aria-hidden />
                  <h3 className="text-lg font-semibold text-fg">{tr(r.title)}</h3>
                  <p className="text-base text-fg-2">{tr(r.body)}</p>
                  <p className="mt-auto border-t pt-3 text-sm text-fg-3">{tr(r.sees)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-20 sm:px-8">
          <h2 className="text-2xl font-semibold text-fg">{tr("land.secTitle")}</h2>
          <p className="mt-2 max-w-[640px] text-base text-fg-2">{tr("land.secSub")}</p>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((x) => (
              <div key={x.title} className="flex gap-3">
                <x.icon className="mt-0.5 size-5 shrink-0 text-fg-3" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-fg">{tr(x.title)}</h3>
                  <p className="mt-1 text-sm text-fg-2">{tr(x.body)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing placeholder */}
        <section id="pricing" className="border-t bg-surface">
          <div className="mx-auto flex max-w-[1200px] scroll-mt-16 flex-col items-start gap-4 px-4 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-fg">{tr("land.priceTitle")}</h2>
              <p className="mt-2 max-w-[640px] text-base text-fg-2">{tr("land.priceBody")}</p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-5 text-base font-medium text-accent-fg hover:bg-accent/90"
            >
              {tr("land.cta")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-fg-3 sm:px-8">
          <span className="flex items-center gap-2">
            <LogoMark size={18} variant="mono" className="text-fg-3" /> {BRAND.name} ·{" "}
            {BRAND.ownerPromise[lang]}
          </span>
          <span>{tr("land.footer")}</span>
        </div>
      </footer>
    </div>
  );
}
