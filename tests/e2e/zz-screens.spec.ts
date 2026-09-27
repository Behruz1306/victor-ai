import { test, type Browser } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

// C7 screenshot matrix → docs/screenshots/after/. Opt-in (E2E_SCREENS=1 or `pnpm screens`):
// every screen in light and dark at 1440 and 1280; owner, login and landing also at 390.
const OUT = path.resolve(import.meta.dirname, "../../docs/screenshots/after");
test.skip(!process.env.E2E_SCREENS, "screenshot matrix is opt-in (pnpm screens)");

type Role = "owner" | "lead" | "dispatcher" | null;
const SCREENS: { name: string; role: Role; path: string; phone?: boolean; full?: boolean; prep?: "overlay" }[] = [
  { name: "landing", role: null, path: "/", phone: true, full: true },
  { name: "login", role: null, path: "/login", phone: true },
  { name: "owner", role: "owner", path: "/owner", phone: true, full: true },
  { name: "dispatcher", role: "dispatcher", path: "/dispatcher" },
  { name: "lead", role: "lead", path: "/lead" },
  { name: "playbook", role: "owner", path: "/playbook", full: true },
  { name: "sources", role: "owner", path: "/sources" },
  { name: "sources-overlay", role: "owner", path: "/sources", prep: "overlay" },
  { name: "settings", role: "owner", path: "/settings", full: true },
  { name: "demo", role: "owner", path: "/demo", full: true },
  { name: "task", role: "dispatcher", path: "task:48230", full: true },
];

async function open(browser: Browser, role: Role, width: number, theme: string, lang: string) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await ctx.addCookies([
    { name: "victor_theme", value: theme, url: "http://localhost:3001" },
    { name: "victor_lang", value: lang, url: "http://localhost:3001" },
  ]);
  const page = await ctx.newPage();
  if (role) {
    await page.goto("/login");
    await page.getByTestId(`demo-login-${role}`).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  return page;
}

test("screenshot matrix", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const s of SCREENS) {
      const widths = s.phone ? [1440, 1280, 390] : [1440, 1280];
      for (const width of widths) {
        const lang = width === 390 ? "ru" : "en";
        const page = await open(browser, s.role, width, theme, lang);
        let target = s.path;
        if (target.startsWith("task:")) {
          await page.goto("/dispatcher");
          const link = page.getByTestId(`task-${target.slice(5)}`);
          await link.waitFor({ timeout: 15_000 }).catch(() => {});
          target = (await link.getAttribute("href").catch(() => null)) ?? "/dispatcher";
        }
        await page.goto(target);
        await page.waitForLoadState("networkidle");
        if (s.prep === "overlay") await page.getByTestId("overlay-toggle").click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `${s.name}-${width}-${theme}${width === 390 ? "-ru" : ""}.png`), fullPage: Boolean(s.full) });
        await page.context().close();
      }
    }
  }
});
