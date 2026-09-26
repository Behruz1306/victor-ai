import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { t, formatDuration } from "@/lib/i18n";
import { atLocalTime, localDay, localParts, zonedToUtc, tzAbbreviation } from "@/lib/time";

describe("i18n", () => {
  it("ru has every en key and no empty strings", () => {
    for (const key of Object.keys(en)) {
      expect(ru[key as keyof typeof en], key).toBeTruthy();
    }
    expect(Object.keys(ru).length).toBe(Object.keys(en).length);
  });
  it("interpolates params", () => {
    expect(t("en", "disp.ruleLearned", { customer: "Apex" })).toBe(
      "Saved. New rule learned for Apex",
    );
    expect(t("ru", "common.minutes", { n: 5 })).toBe("5 мин");
  });
  it("formats durations", () => {
    expect(formatDuration("en", 14)).toBe("14 min");
    expect(formatDuration("en", 90)).toBe("1.5 h");
  });
});

describe("time", () => {
  const tz = "America/Chicago";
  it("converts local wall-clock to UTC across DST", () => {
    // July: CDT = UTC-5
    expect(zonedToUtc(2026, 7, 1, 9, 0, tz).toISOString()).toBe("2026-07-01T14:00:00.000Z");
    // January: CST = UTC-6
    expect(zonedToUtc(2026, 1, 15, 9, 0, tz).toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });
  it("atLocalTime gives yesterday at a local time", () => {
    const now = new Date("2026-09-26T15:00:00Z"); // 10:00 CDT
    const y = atLocalTime(now, tz, -1, 16, 30);
    expect(localDay(y, tz)).toBe("2026-09-25");
    expect(localParts(y, tz)).toMatchObject({ h: 16, min: 30 });
  });
  it("names the zone abbreviation", () => {
    expect(tzAbbreviation(new Date("2026-01-15T15:00:00Z"), tz)).toBe("CST");
    expect(tzAbbreviation(new Date("2026-07-01T15:00:00Z"), tz)).toBe("CDT");
  });
});
