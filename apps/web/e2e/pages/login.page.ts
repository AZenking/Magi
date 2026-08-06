import type { Page, Locator } from "@playwright/test";

/**
 * Page object for /login (components/login-form.tsx).
 *
 * This app uses TanStack Start SSR, so after `goto` the DOM is present but
 * React handlers are attached only once hydration finishes. We therefore wait
 * for `networkidle` before interacting — interacting earlier silently no-ops
 * (the submit doesn't reach the antd Form onFinish handler).
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // antd Form.Item labels don't reliably associate to the inner input, so
    // anchor on the explicit autoComplete attributes instead.
    this.usernameInput = page.locator('input[autocomplete="username"]');
    this.passwordInput = page.locator('input[autocomplete="current-password"]');
    // antd inserts a space in two-CJK-char button labels ("登 录").
    this.submitButton = page.getByRole("button", { name: /登\s*录/ });
  }

  async goto() {
    await this.page.goto("/login");
    await this.page.waitForLoadState("networkidle");
  }

  /** Fill credentials via keyboard (keeps React controlled state in sync). */
  async login(username: string, password: string) {
    await this.usernameInput.click();
    await this.page.keyboard.type(username);
    await this.passwordInput.click();
    await this.page.keyboard.type(password);
    await this.submitButton.click();
  }
}
