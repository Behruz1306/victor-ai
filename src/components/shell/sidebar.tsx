"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Gauge,
  UsersRound,
  Inbox,
  BookOpen,
  Cable,
  Settings,
  Presentation,
  Search,
  LogOut,
  Menu as MenuIcon,
  SlidersHorizontal,
  Check,
  ChevronsUpDown,
  Languages,
  Sun,
  Moon,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useT, useTheme } from "@/components/providers";
import { LogoMark, Wordmark } from "@/components/brand";
import { Avatar, LiveDot } from "@/components/common";
import { Kbd } from "@/components/ui/primitives";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  SheetContent,
  Tooltip,
} from "@/components/ui/overlay";
import { CommandPalette, useCommandPalette } from "./command-palette";
import { apiGet, type Jsonify } from "@/lib/client/api";
import type { shellStatus } from "@/lib/queries/shell";
import { LANG_COOKIE, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Status = Jsonify<Awaited<ReturnType<typeof shellStatus>>>;
type Role = "owner" | "lead" | "dispatcher";

const ICONS: Record<string, typeof Inbox> = {
  "/owner": Gauge,
  "/lead": UsersRound,
  "/dispatcher": Inbox,
  "/playbook": BookOpen,
  "/sources": Cable,
  "/settings": Settings,
  "/demo": Presentation,
};

export type ShellProps = {
  user: { name: string; role: Role };
  company: string;
  items: { href: string; key: string }[];
  demoMode: boolean;
  initialStatus: Status;
};

function NavList({ items, onNavigate }: { items: ShellProps["items"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = ICONS[item.href] ?? Inbox;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-nav={item.key.replace("nav.", "")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors duration-[120ms]",
              active
                ? "bg-accent-soft font-medium text-accent-text"
                : "text-fg-2 hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-accent-text" : "text-fg-3 group-hover:text-fg-2",
              )}
              aria-hidden
            />
            <span className="truncate">{t(item.key as TKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LiveIndicator({ status }: { status: Status }) {
  const { t } = useT();
  const details = (
    <div className="flex flex-col gap-1 py-0.5">
      <span>
        {status.live
          ? `${t("shell.live")} · ${t("shell.sources", { n: status.sources })}`
          : t("shell.workerDown")}
      </span>
      <span className="text-fg-3">
        {status.bot.online ? t("shell.botOnline") : t("shell.botOff")}
      </span>
      <span className="text-fg-3">
        {status.ai.offline
          ? t("shell.aiOffline")
          : t("shell.aiLive", { provider: status.ai.provider })}
      </span>
    </div>
  );
  return (
    <Tooltip content={details} side="right">
      <div
        className="flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-fg-2"
        data-testid="live-indicator"
        tabIndex={0}
      >
        <LiveDot on={status.live} />
        <span className="truncate">
          {status.live ? t("shell.live") : t("shell.offline")}
          <span className="text-fg-3"> · {t("shell.sources", { n: status.sources })}</span>
        </span>
      </div>
    </Tooltip>
  );
}

const ROLES: { role: Role; name: string }[] = [
  { role: "owner", name: "Rustam" },
  { role: "lead", name: "Dilnoza" },
  { role: "dispatcher", name: "Timur" },
];

function RoleSwitcher({ current }: { current: Role }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const switchTo = async (role: Role) => {
    if (role === current || busy) return;
    setBusy(true);
    const res = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = (await res.json().catch(() => ({}))) as { home?: string };
    setBusy(false);
    if (res.ok && body.home) {
      router.push(body.home);
      router.refresh();
    }
  };
  return (
    <Menu>
      <MenuTrigger
        className="flex h-8 w-full items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 text-sm text-fg-2 hover:bg-surface-2"
        data-testid="role-switcher"
      >
        <span className="truncate">
          {t("shell.viewAs")}:{" "}
          <span className="font-medium text-fg">{t(`role.${current}` as TKey)}</span>
        </span>
        <ChevronsUpDown className="ml-auto size-3.5 text-fg-3" aria-hidden />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-[208px]">
        <MenuLabel>{t("shell.switchRole")}</MenuLabel>
        {ROLES.map((r) => (
          <MenuItem
            key={r.role}
            onSelect={() => void switchTo(r.role)}
            data-testid={`switch-${r.role}`}
          >
            <Avatar name={r.name} size={20} />
            <span className="flex-1">
              {t(`role.${r.role}` as TKey)} <span className="text-fg-3">· {r.name}</span>
            </span>
            {r.role === current ? <Check className="!text-accent-text" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function PrefsMenu() {
  const { t, lang } = useT();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const setLang = (next: "en" | "ru") => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <Menu>
      <MenuTrigger
        className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
        aria-label={t("shell.preferences")}
        data-testid="prefs-menu"
      >
        <SlidersHorizontal className="size-4" />
      </MenuTrigger>
      <MenuContent side="top" align="end">
        <MenuLabel>{t("shell.language")}</MenuLabel>
        <MenuItem onSelect={() => setLang("en")} data-testid="lang-en">
          <Languages /> English{" "}
          {lang === "en" ? <Check className="ml-auto !text-accent-text" /> : null}
        </MenuItem>
        <MenuItem onSelect={() => setLang("ru")} data-testid="lang-ru">
          <Languages /> Русский{" "}
          {lang === "ru" ? <Check className="ml-auto !text-accent-text" /> : null}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("shell.theme")}</MenuLabel>
        <MenuItem onSelect={() => setTheme("light")}>
          <Sun /> {t("shell.themeLight")}{" "}
          {theme === "light" ? <Check className="ml-auto !text-accent-text" /> : null}
        </MenuItem>
        <MenuItem onSelect={() => setTheme("dark")}>
          <Moon /> {t("shell.themeDark")}{" "}
          {theme === "dark" ? <Check className="ml-auto !text-accent-text" /> : null}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UserRow({ user }: { user: ShellProps["user"] }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
      <Avatar name={user.name} size={28} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-fg">{user.name}</div>
        <div className="truncate text-xs text-fg-3">{t(`role.${user.role}` as TKey)}</div>
      </div>
      <PrefsMenu />
      <button
        className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
        aria-label={t("shell.logout")}
        title={t("shell.logout")}
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function SidebarBody({
  props,
  status,
  onSearch,
  onNavigate,
}: {
  props: ShellProps;
  status: Status;
  onSearch: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Victor AI">
          <LogoMark size={24} />
          <Wordmark />
        </Link>
      </div>
      <div className="px-3 pb-1 text-xs text-fg-3">
        <span className="sr-only">{t("shell.company")}: </span>
        {props.company}
      </div>
      <div className="px-3 pt-2">
        <button
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border bg-bg px-2.5 text-sm text-fg-3 hover:border-border-strong hover:text-fg-2"
          data-testid="open-command"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="truncate">{t("shell.search")}</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
      </div>
      <div className="mt-4 px-3">
        <NavList items={props.items} onNavigate={onNavigate} />
      </div>
      <div className="mt-auto flex flex-col gap-1.5 border-t p-3">
        <LiveIndicator status={status} />
        {props.demoMode ? <RoleSwitcher current={props.user.role} /> : null}
        <UserRow user={props.user} />
      </div>
    </div>
  );
}

export function Shell({ children, ...props }: ShellProps & { children: React.ReactNode }) {
  const { t } = useT();
  const palette = useCommandPalette();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const status =
    useQuery({
      queryKey: ["shell-status"],
      queryFn: () => apiGet<Status>("/api/shell"),
      initialData: props.initialStatus,
      refetchInterval: 15_000,
    }).data ?? props.initialStatus;

  return (
    <div className="flex min-h-screen">
      <div className="no-print hidden w-[232px] shrink-0 border-r bg-surface lg:block">
        <aside className="sticky top-0 h-screen">
          <SidebarBody props={props} status={status} onSearch={() => palette.setOpen(true)} />
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur lg:hidden">
          <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogPrimitive.Trigger
              className="grid size-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2"
              aria-label={t("shell.menu")}
              data-testid="mobile-menu"
            >
              <MenuIcon className="size-5" />
            </DialogPrimitive.Trigger>
            <SheetContent
              side="left"
              title="Victor AI"
              className="w-[264px] [&>div:first-child]:hidden"
            >
              <SidebarBody
                props={props}
                status={status}
                onSearch={() => {
                  setMobileOpen(false);
                  palette.setOpen(true);
                }}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </DialogPrimitive.Root>
          <Link href="/" className="flex items-center gap-2" aria-label="Victor AI">
            <LogoMark size={22} />
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <LiveDot on={status.live} className="mr-1.5" />
            <button
              onClick={() => palette.setOpen(true)}
              className="grid size-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2"
              aria-label={t("shell.search")}
            >
              <Search className="size-4.5" />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}
