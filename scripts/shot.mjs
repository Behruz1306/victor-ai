// Dev helper: node scripts/shot.mjs <role> <path> <out.png> [width] [theme] [lang]
import { chromium } from "@playwright/test";
const [role, path, out, width = "1440", theme = "light", lang = "en"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([
  { name: "pulse_theme", value: theme, url: base },
  { name: "pulse_lang", value: lang, url: base },
]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${base}/login`);
await page.getByTestId(`demo-login-${role}`).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));
await page.goto(`${base}${path}`);
await page.waitForTimeout(Number(process.env.WAIT ?? 2500));
await page.screenshot({ path: out, fullPage: true });
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
