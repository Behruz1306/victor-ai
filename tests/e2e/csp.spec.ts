import { expect, test, type Browser, type Page } from "@playwright/test";

// Every page renders under the nonce CSP (no 'unsafe-inline' for scripts) without a single
// CSP violation or page error in the browser console.
const BASE = "http://localhost:3001";

async function loginAs(browser: Browser, role: "owner" | "lead" | "dispatcher") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text()))
      problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function visit(page: Page, path: string, problems: string[]) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  const csp = res?.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  expect(scriptSrc, path).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(scriptSrc, path).not.toContain("'unsafe-inline'");
  await page.waitForLoadState("networkidle");
  expect(problems, `CSP/page errors on ${path}`).toEqual([]);
}

test("no CSP violations on any page, for any role", async ({ browser }) => {
  test.setTimeout(180_000);
  const anon = await browser.newPage({ baseURL: BASE });
  const anonProblems = watch(anon);
  await visit(anon, "/login", anonProblems);
  await visit(anon, "/", anonProblems);

  const owner = await loginAs(browser, "owner");
  const op = watch(owner);
  for (const p of [
    "/owner",
    "/lead",
    "/playbook",
    "/sources",
    "/settings",
    "/demo",
    "/dispatcher",
  ]) {
    await visit(owner, p, op);
  }

  const timur = await loginAs(browser, "dispatcher");
  const tp = watch(timur);
  await visit(timur, "/dispatcher", tp);
  const task = timur.locator('[data-testid^="task-"]').first();
  if (await task.count()) {
    await task.click();
    await timur.waitForURL("**/tasks/**");
    await timur.waitForLoadState("networkidle");
    expect(tp).toEqual([]);
  }

  const lead = await loginAs(browser, "lead");
  const lp = watch(lead);
  await visit(lead, "/lead", lp);
});
