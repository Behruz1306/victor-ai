"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Sun, Languages } from "lucide-react";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function NavLinks({ items }: { items: { href: string; key: string }[] }) {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(item.key as TKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function LangToggle() {
  const { lang, t } = useT();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t("shell.lang")}
      data-testid="lang-toggle"
      onClick={() => {
        setCookie("pulse_lang", lang === "en" ? "ru" : "en");
        router.refresh();
      }}
    >
      <Languages />
      <span className="text-xs font-semibold">{lang === "en" ? "EN" : "RU"}</span>
    </Button>
  );
}

export function ThemeToggle() {
  const { t } = useT();
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("shell.theme")}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        setCookie("pulse_theme", next ? "dark" : "light");
        setDark(next);
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function LogoutButton() {
  const { t } = useT();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("shell.logout")}
      title={t("shell.logout")}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut />
    </Button>
  );
}
