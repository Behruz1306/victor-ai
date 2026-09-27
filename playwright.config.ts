import { defineConfig, devices } from "@playwright/test";

// Golden-path e2e against the production build (run `pnpm build` first). Expects Postgres up and
// migrations applied; the test seeds the demo itself. The mock provider keeps it deterministic and
// free (no LLM quota); Telegram is off so the run never competes for the bot's long poll.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Binaries directly, not `pnpm …`: pnpm moves its child into a new process group, so
        // Playwright's teardown could not stop the server and the run hung after the tests.
        command:
          'node_modules/.bin/concurrently -k -n web,worker "node_modules/.bin/next start -p 3001" "node --env-file-if-exists=.env dist/worker.mjs"',
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        url: "http://localhost:3001/api/health",
        reuseExistingServer: false,
        timeout: 180_000,
        env: { DEMO_MODE: "true", LLM_PROVIDER: "mock", TELEGRAM_BOT_TOKEN: "" },
      },
});
