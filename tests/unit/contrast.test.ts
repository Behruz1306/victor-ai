import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// WCAG AA for every text/background token pair, in both themes, read from the real CSS.
const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT_ON: [string, string[]][] = [
  ["fg", ["bg", "surface", "surface-2", "surface-3"]],
  ["fg-2", ["bg", "surface", "surface-2"]],
  ["fg-3", ["bg", "surface", "surface-2"]],
  ["accent-text", ["surface", "bg", "accent-soft"]],
  ["accent-fg", ["accent"]],
  ["critical", ["critical-soft", "surface", "bg"]],
  ["high", ["high-soft", "surface", "bg"]],
  ["medium", ["medium-soft", "surface", "bg"]],
  ["low", ["low-soft", "surface", "bg"]],
  ["ok", ["ok-soft", "surface", "bg"]],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme meets WCAG AA", (_name, selector) => {
  const t = block(selector);
  it("defines every token as hex", () => {
    for (const [fg, bgs] of TEXT_ON) {
      expect(t[fg], fg).toMatch(/^#/);
      for (const bg of bgs) expect(t[bg], bg).toMatch(/^#/);
    }
  });
  for (const [fg, bgs] of TEXT_ON) {
    for (const bg of bgs) {
      it(`${fg} on ${bg} ≥ 4.5:1`, () => {
        expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("focus ring (accent) is visible against surfaces (≥ 3:1)", () => {
    expect(contrast(t.accent!, t.surface!)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.accent!, t.bg!)).toBeGreaterThanOrEqual(3);
  });
});
