import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { LoginPage } from "./pages/login.page";

/**
 * One-time UI login. Persists the authenticated session (cookies + storage)
 * to e2e/.auth/user.json so every downstream spec starts already signed in.
 *
 * Credentials come from env (E2E_USERNAME / E2E_PASSWORD), defaulting to the
 * dev-seeded admin account. Run `pnpm --filter @magi/api seed` first if the
 * DB has no admin yet.
 */
const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "zxcv1234";
const STORAGE_STATE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await mkdir(dirname(STORAGE_STATE), { recursive: true });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(USERNAME, PASSWORD);

  // better-auth redirects to /dashboard on success.
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
