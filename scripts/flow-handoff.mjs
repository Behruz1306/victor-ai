// Dev helper: lead generates a handoff for Timur → Aziz and screenshots the brief.
import { chromium } from "@playwright/test";
const [out] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3001";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${base}/login`);
await page.getByTestId("demo-login-lead").click();
await page.waitForURL("**/lead");
await page.getByTestId("lead-row-Timur").click();
await page.getByTestId("handoff-panel").waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: out.replace(".png", "-lead.png"), fullPage: true });
await page.getByTestId("handoff-generate").click();
await page.waitForURL("**/lead/handoff/**", { timeout: 60000 });
await page.getByTestId("handoff-brief").first().waitFor();
await page.screenshot({ path: out, fullPage: true });
console.log("briefs:", await page.getByTestId("handoff-brief").count());
await browser.close();
