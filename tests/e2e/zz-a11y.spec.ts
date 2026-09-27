import { expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated accessibility check (axe) on every page, both themes: no serious or critical
// violations. Runs after the golden path so every screen has real data.
async function loginAs(browser: Browser, role: "owner" | "lead" | "dispatcher", theme: "light" | "dark") {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "victor_theme", value: theme, url: "http://localhost:3001" }]);
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(report, `axe on ${path}`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`no serious/critical axe violations (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "victor_theme", value: theme, url: "http://localhost:3001" }]);
    const anon = await ctx.newPage();
    await audit(anon, "/");
    await audit(anon, "/login");
    const owner = await loginAs(browser, "owner", theme);
    for (const p of ["/owner", "/lead", "/dispatcher", "/playbook", "/sources", "/settings", "/demo"]) await audit(owner, p);
    const timur = await loginAs(browser, "dispatcher", theme);
    await audit(timur, "/dispatcher");
    const task = timur.locator('[data-testid^="task-"]').first();
    if (await task.count()) {
      const href = await task.getAttribute("href");
      if (href) await audit(timur, href);
    }
  });
}
