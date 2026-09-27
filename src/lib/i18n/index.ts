import { en, type TKey } from "./en";
import { ru } from "./ru";
import type { Lang } from "@/lib/types";

export type { TKey };
export const LANG_COOKIE = "victor_lang";
export const DICTS = { en, ru } as const;

export function t(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const template: string = DICTS[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

/** Russian plural form for n: one (1, 21), few (2–4, 22–24), many (5–20, 25…). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export function parseLang(value: string | undefined | null): Lang {
  return value === "ru" ? "ru" : "en";
}

/** Human duration like "15 min", "3 h", "2 d". */
export function formatDuration(lang: Lang, minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return t(lang, "common.minutes", { n: m });
  if (m < 60 * 48) return t(lang, "common.hours", { n: Math.round(m / 6) / 10 });
  return t(lang, "common.days", { n: Math.round(m / 144) / 10 });
}

export function formatAgo(lang: Lang, date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const minutes = (now.getTime() - d.getTime()) / 60000;
  if (minutes < -1) return t(lang, "common.in", { t: formatDuration(lang, -minutes) });
  if (minutes < 1) return t(lang, "common.justNow");
  return t(lang, "common.ago", { t: formatDuration(lang, minutes) });
}

export function formatTime(lang: Lang, date: Date | string, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(d);
}
