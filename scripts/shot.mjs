// Dev helper: node scripts/shot.mjs <role|anon> <path> <out.png> [width] [theme] [lang] [fullPage]
import { chromium } from "@playwright/test";
const [role, path, out, width = "1440", theme = "light", lang = "en", full = "true"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3001";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: Number(width), height: Number(process.env.HEIGHT ?? 900) },
  deviceScaleFactor: Number(process.env.DPR ?? 1),
});
await ctx.addCookies([
  { name: "victor_theme", value: theme, url: base },
  { name: "victor_lang", value: lang, url: base },
]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
if (role !== "anon") {
  await page.goto(`${base}/login`);
  await page.getByTestId(`demo-login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
await page.goto(`${base}${path}`);
await page.waitForTimeout(Number(process.env.WAIT ?? 2500));
await page.screenshot({
  path: out,
  fullPage: full === "true",
  ...(out.endsWith(".jpg") ? { type: "jpeg", quality: 82 } : {}),
});
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
