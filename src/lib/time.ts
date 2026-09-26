// Timezone helpers without external deps. All pipeline logic works in UTC instants;
// these convert to and from a company's local wall-clock time.

export type LocalParts = {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  weekday: number;
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date: Date, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    min: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Offset of `tz` from UTC at `date`, in minutes (Chicago in summer → -300). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  const truncated = Math.floor(date.getTime() / 60000) * 60000;
  return Math.round((asUtc - truncated) / 60000);
}

/** Wall-clock time in `tz` → UTC instant. Handles DST by re-checking the offset. */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** Calendar day in `tz` as YYYY-MM-DD. */
export function localDay(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Same local wall-clock time shifted by whole days (DST-safe). */
export function atLocalTime(
  base: Date,
  tz: string,
  dayOffset: number,
  h: number,
  min: number,
): Date {
  const p = localParts(base, tz);
  const shifted = new Date(Date.UTC(p.y, p.m - 1, p.d + dayOffset));
  return zonedToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    h,
    min,
    tz,
  );
}

/** Short US-style time in `tz`, e.g. "4:30 PM". */
export function formatClock(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Abbreviation like "CDT"/"CST" for a timezone at a date. */
export function tzAbbreviation(date: Date, tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}
