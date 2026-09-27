import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

// Golden path from BUILD_PROMPT §2, end to end in a real browser against the running app
// (pnpm dev = web + worker). Saves screenshots to docs/screenshots/.
const SHOTS = path.resolve(import.meta.dirname, "../../docs/screenshots");
const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

async function loginAs(
  browser: Browser,
  role: "owner" | "lead" | "dispatcher",
  opts: { lang?: "en" | "ru"; theme?: "light" | "dark"; width?: number } = {},
) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1440, height: 900 } });
  await ctx.addCookies([
    { name: "pulse_lang", value: opts.lang ?? "en", url: "http://localhost:3000" },
    { name: "pulse_theme", value: opts.theme ?? "light", url: "http://localhost:3000" },
  ]);
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

test.describe.configure({ mode: "serial" });

test("golden path: chaos → dispatcher → edit & learn → task card → owner → live mode", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  // 0. Login page
  const anon = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await anon.goto("/login");
  await expect(anon.getByTestId("demo-login-dispatcher")).toBeVisible();
  await shot(anon, "01-login");
  await anon.close();

  // Presenter prepares the demo from the control room.
  const owner = await loginAs(browser, "owner");
  await owner.goto("/demo");
  await owner.getByTestId("demo-reset").click();
  await expect(owner.getByRole("status")).toContainText(/Done/, { timeout: 60_000 });
  await owner.getByTestId("demo-load").click();
  await expect(owner.getByRole("status")).toContainText(/Load/, { timeout: 120_000 });
  await expect(owner.getByTestId("demo-queue")).toContainText(/PENDING\s*0/i, { timeout: 90_000 });

  // 1. Raw chaos
  await owner.goto("/sources");
  await expect(owner.getByText("Apex ↔ Blue Ridge").first()).toBeVisible();
  await owner.getByRole("button", { name: /Fleet/ }).first().click();
  await expect(owner.getByText(/трак 214/)).toBeVisible();
  await shot(owner, "02-sources-raw-chaos");

  // 2. Dispatcher screen with cross-chat context
  const timur = await loginAs(browser, "dispatcher");
  await expect(timur.getByTestId("suggestion-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(timur.getByTestId("badge-complaint").first()).toBeVisible();
  const card = timur.getByTestId("suggestion-card").first();
  await expect(card.getByTestId("used-context")).toContainText("Fleet");
  await expect(card.getByTestId("suggestion-text")).toContainText("4:30 PM");
  await shot(timur, "03-dispatcher", false);

  // 3. Edit → learning
  await card.getByTestId("suggestion-edit").click();
  const box = card.getByTestId("suggestion-edit-text");
  const text = await box.inputValue();
  await box.fill(
    text
      .replace("around 4:30 PM", "4:30 PM CST")
      .replace("Load 48207 is", "Load 48207, truck #214 is"),
  );
  await card
    .getByTestId("suggestion-edit-reason")
    .fill("Apex wants ETA in CST and with the truck number");
  await card.getByTestId("suggestion-save-edit").click();
  await expect(timur.getByTestId("toast")).toContainText("New rule learned for Apex Logistics");
  await expect(timur.getByTestId("edit-rate")).toContainText("100%");
  await expect(timur.getByTestId("applied-rules").first()).toBeVisible({ timeout: 30_000 });
  await expect(
    timur.getByTestId("suggestion-card").first().getByTestId("suggestion-text"),
  ).toContainText("CST");
  await shot(timur, "04-edit-learned-rule", false);

  // 4. Task card: stuck step with reason
  await timur.getByTestId("task-48230").click();
  await expect(timur.getByTestId("task-title")).toContainText("48230");
  await expect(timur.getByTestId("step-acknowledged")).toContainText(/Stuck here/);
  await shot(timur, "05-task-card");

  // 5. Owner screen: ≤ 5 items + 3 KPIs
  await owner.goto("/owner");
  await expect(owner.getByTestId("digest-item").first()).toBeVisible({ timeout: 30_000 });
  const items = await owner.getByTestId("digest-item").count();
  expect(items).toBeGreaterThan(0);
  expect(items).toBeLessThanOrEqual(5);
  for (const k of ["kpi-open", "kpi-risk", "kpi-ack"])
    await expect(owner.getByTestId(k)).toBeVisible();
  await shot(owner, "06-owner");

  // Lead, playbook, settings for the record
  const lead = await loginAs(browser, "lead");
  await expect(lead.getByTestId("lead-table")).toBeVisible();
  await expect(lead.getByTestId("handoff-panel")).toBeVisible();
  await expect(lead.getByTestId("lead-problems")).toBeVisible({ timeout: 15_000 });
  await shot(lead, "07-lead");
  await owner.goto("/playbook");
  await expect(owner.getByTestId("rule-card").first()).toContainText("CST");
  await shot(owner, "08-playbook");
  await owner.goto("/settings");
  await expect(owner.getByTestId("audit-table")).toContainText("suggestion_edited");
  await shot(owner, "09-settings");

  // 6. Live mode (scripted replay stands in for the Telegram group; same ingestion path)
  await owner.goto("/demo");
  await owner.getByTestId("demo-replay-start").click();
  await timur.goto("/dispatcher");
  await expect(timur.getByTestId("task-48244")).toBeVisible({ timeout: 45_000 });
  await expect(timur.getByText(/Dallas → Atlanta/).first()).toBeVisible();
  await shot(timur, "10-live-mode", false);
  await shot(owner, "11-demo-control");

  // 7. Handoff brief
  await lead.reload();
  await lead.getByTestId("lead-row-Timur").click();
  await lead.getByTestId("handoff-generate").click();
  await lead.waitForURL("**/lead/handoff/**", { timeout: 60_000 });
  await expect(lead.getByTestId("handoff-brief").first()).toBeVisible();
  await shot(lead, "12-handoff-brief");
});

test("owner on a phone, dispatcher in Russian dark mode", async ({ browser }) => {
  const phone = await loginAs(browser, "owner", { width: 390, lang: "ru" });
  await expect(phone.getByTestId("digest-item").first()).toBeVisible({ timeout: 30_000 });
  await shot(phone, "13-owner-mobile-ru");
  const dark = await loginAs(browser, "dispatcher", { lang: "ru", theme: "dark" });
  await expect(dark.getByTestId("suggestion-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(dark.getByText("Мои чаты")).toBeVisible();
  await shot(dark, "14-dispatcher-dark-ru", false);
});

test("API refuses cross-role access", async ({ browser }) => {
  const timur = await loginAs(browser, "dispatcher");
  expect((await timur.request.get("/api/owner")).status()).toBe(403);
  expect((await timur.request.get("/api/lead")).status()).toBe(403);
  const anon = await browser.newPage();
  expect((await anon.request.get("/api/dispatcher")).status()).toBe(401);
});
