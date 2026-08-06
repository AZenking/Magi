import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for @magi/web.
 *
 * Assumes the web dev server (http://localhost:3000) and the API
 * (http://localhost:3001) are already running — start them with `pnpm dev`.
 * Override the web base URL with E2E_BASE_URL if needed.
 *
 * Auth flow: the `setup` project logs in once via the UI and persists the
 * session cookies to `.auth/user.json`; every other project reuses it through
 * project dependencies.
 */
const WEB_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STORAGE_STATE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  // setup project writes the storage state; specs must not race on it.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_BASE_URL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // 1. Log in once and persist the session for every downstream project.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: undefined },
    },
    // 2. Actual specs — reuse the session saved by `setup`.
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});
