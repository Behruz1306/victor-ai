// Dev helper: owner resets the demo, loads "yesterday", starts the live replay, then screenshots.
import { chromium } from "@playwright/test";
const [outDir] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/login`);
await page.getByTestId("demo-login-owner").click();
await page.waitForURL("**/owner");
await page.goto(`${base}/demo`);
for (const id of ["demo-reset", "demo-load"]) {
  await page.getByTestId(id).click();
  await page.getByRole("status").waitFor({ timeout: 90000 });
  console.log(id, "→", await page.getByRole("status").innerText());
}
await page.waitForTimeout(8000);
await page.getByTestId("demo-replay-start").click();
await page.waitForTimeout(12000);
await page.screenshot({ path: `${outDir}/demo.png`, fullPage: true });
console.log("queue:", (await page.getByTestId("demo-queue").innerText()).replace(/\n/g, " "));
await page.waitForTimeout(35000);
await page.screenshot({ path: `${outDir}/demo-after.png`, fullPage: true });
if (errors.length) console.log("PAGE ERRORS", errors);
await browser.close();
