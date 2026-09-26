import { defineConfig, devices } from "@playwright/test";

// Golden-path smoke. Expects Postgres up, migrations applied; the test seeds the demo itself.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: true,
        timeout: 180_000,
        env: { DEMO_MODE: "true" },
      },
});
