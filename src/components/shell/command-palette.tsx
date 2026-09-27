"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { Building2, ListTodo, UserRound, LayoutGrid, Search, CornerDownLeft } from "lucide-react";
import { useT } from "@/components/providers";
import { apiGet, type Jsonify } from "@/lib/client/api";
import type { searchIndex } from "@/lib/queries/shell";
import { pick } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

type Index = Jsonify<Awaited<ReturnType<typeof searchIndex>>>;

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  return { open, setOpen };
}

const item =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-base text-fg data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, lang } = useT();
  const router = useRouter();
  const q = useQuery({
    queryKey: ["search-index"],
    queryFn: () => apiGet<Index>("/api/search"),
    enabled: open,
    staleTime: 20_000,
  });
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const d = q.data;
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("shell.search")}
      overlayClassName="fixed inset-0 z-50 bg-[rgb(8_10_14/0.4)]"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-surface text-fg shadow-pop animate-enter"
    >
      <div className="flex items-center gap-2.5 border-b px-4">
        <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
        <Command.Input
          placeholder={t("cmd.placeholder")}
          className="h-12 w-full bg-transparent text-lg text-fg outline-none placeholder:text-fg-3"
        />
      </div>
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-fg-3">
          {t("cmd.empty")}
        </Command.Empty>
        {d ? (
          <>
            <Command.Group
              heading={t("cmd.screens")}
              className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-3"
            >
              {d.screens.map((s) => (
                <Command.Item
                  key={s.href}
                  value={`screen ${t(s.key as TKey)}`}
                  onSelect={() => go(s.href)}
                  className={item}
                >
                  <LayoutGrid /> {t(s.key as TKey)}
                </Command.Item>
              ))}
            </Command.Group>
            {d.customers.length ? (
              <Command.Group
                heading={t("cmd.customers")}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-3"
              >
                {d.customers.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`customer ${c.name}`}
                    onSelect={() => go(`/dispatcher?c=${c.id}`)}
                    className={item}
                  >
                    <Building2 /> {c.name}
                    <span className="ml-auto text-xs text-fg-3">{c.kind}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {d.tasks.length ? (
              <Command.Group
                heading={t("cmd.tasks")}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-3"
              >
                {d.tasks.map((x) => (
                  <Command.Item
                    key={x.id}
                    value={`task ${x.ref ?? ""} ${x.title.en} ${x.title.ru} ${x.customer}`}
                    onSelect={() => go(`/tasks/${x.id}`)}
                    className={item}
                  >
                    <ListTodo />
                    <span className="truncate">{pick(x.title, lang)}</span>
                    <span className="ml-auto shrink-0 text-xs text-fg-3">{x.customer}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {d.people.length ? (
              <Command.Group
                heading={t("cmd.people")}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-3"
              >
                {d.people.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`dispatcher ${p.name}`}
                    onSelect={() => go(`/lead?u=${p.id}`)}
                    className={item}
                  >
                    <UserRound /> {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-2 p-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-8" />
            ))}
          </div>
        )}
      </Command.List>
      <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-fg-3">
        <CornerDownLeft className="size-3.5" aria-hidden /> {t("cmd.hint")}
      </div>
    </Command.Dialog>
  );
}
