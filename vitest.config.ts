import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests use a separate database (victor_test) on the same server; it is created
// and migrated by tests/global-setup.ts.
const TEST_DB =
  process.env.TEST_DATABASE_URL ?? "postgres://pulse:pulse@localhost:5433/victor_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: TEST_DB, LLM_PROVIDER: "mock", DEMO_MODE: "true", TELEGRAM_BOT_TOKEN: "" },
  },
});
