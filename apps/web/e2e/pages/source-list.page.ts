import { expect, type Locator, type Page } from "@playwright/test";
import type { SourceType } from "../fixtures";
import { waitForReady } from "../fixtures";

/**
 * Page object for the shared source list (features/dashboard/sources/
 * source-list-page.tsx), reused by both /dashboard/sources/m3u and
 * /dashboard/sources/xmltv via the `type` prop.
 *
 * This app is SSR (TanStack Start): after navigation the DOM is present but
 * React handlers attach only after hydration, so `goto` waits for
 * `networkidle`. Inputs are filled via keyboard (controlled-component safe)
 * and located by placeholder/autocomplete rather than antd labels.
 */
export class SourceListPage {
  readonly page: Page;
  readonly type: SourceType;
  readonly addButton: Locator;
  readonly refreshButton: Locator;
  readonly nameInput: Locator;
  readonly urlInput: Locator;

  constructor(page: Page, type: SourceType) {
    this.page = page;
    this.type = type;
    this.addButton = page.getByRole("button", { name: "添加源" });
    this.refreshButton = page.getByRole("button", { name: "刷新", exact: true }).or(
      page.getByLabel("刷新"),
    );
    // ProFormText fields: locate by placeholder (stable across antd versions).
    this.nameInput = page.getByPlaceholder("源名称…");
    this.urlInput = page.getByPlaceholder("https://example.com/source");
  }

  async goto() {
    await this.page.goto(`/dashboard/sources/${this.type}`);
    await waitForReady(this.page);
  }

  /** Click "添加源" to open the ModalForm. */
  async openCreateDialog() {
    await this.addButton.click();
    // antd ModalForm titles are not heading roles; locate via .ant-modal-title.
    await expect(this.page.locator(".ant-modal-title").filter({ hasText: "添加源" })).toBeVisible();
  }

  async openEditDialog(name: string) {
    await this.page.getByLabel(`编辑 ${name}`).click();
    await expect(this.page.locator(".ant-modal-title").filter({ hasText: "编辑源" })).toBeVisible();
  }

  /** Fill the ModalForm name + URL fields via keyboard (controlled-safe). */
  async fillForm(opts: { name: string; url: string }) {
    await this.nameInput.click();
    await this.page.keyboard.type(opts.name);
    await this.urlInput.click();
    await this.page.keyboard.type(opts.url);
  }

  /** Clear the name field (used when renaming via edit). */
  async clearName() {
    await this.nameInput.click({ clickCount: 3 });
    await this.page.keyboard.press("Backspace");
  }

  /** Type a new name into the name field (controlled-component safe). */
  async typeName(value: string) {
    await this.nameInput.click();
    await this.page.keyboard.type(value);
  }

  /** Submit the ModalForm via the antd "确定" footer button. */
  async submitForm() {
    // antd inserts a space in two-CJK-char button labels ("确 定").
    await this.page.getByRole("button", { name: /确\s*定/ }).click();
  }

  /** Assert an antd success message toast contains the given text. */
  async expectMessage(text: string) {
    await expect(this.page.locator(".ant-message").filter({ hasText: text })).toBeVisible({
      timeout: 10_000,
    });
  }

  /** Assert a row with the given name is present in the table. */
  async expectRowVisible(name: string) {
    await expect(
      this.page.locator(".ant-table-row").filter({ hasText: name }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Assert a row with the given name is absent from the table. */
  async expectRowAbsent(name: string) {
    await expect(
      this.page.locator(".ant-table-row").filter({ hasText: name }),
    ).toHaveCount(0, { timeout: 15_000 });
  }

  /** Submit a keyword in the ProTable search filter (virtual "搜索" column). */
  async search(keyword: string) {
    // The virtual "搜索" column renders a text input inside the QueryFilter.
    // It has no placeholder, so target the first textbox in the search form.
    const filter = this.page.locator(".ant-pro-table-search").or(
      this.page.locator("form").filter({ hasText: "搜索" }),
    );
    const input = filter.getByRole("textbox").first();
    await input.click();
    await this.page.keyboard.type(keyword);
    await this.page.getByRole("button", { name: /查\s*询/ }).click();
    await waitForReady(this.page);
  }

  // ── Safe Operations delete flow ────────────────────────────────────────

  /** Click the row "删除 {name}" button to trigger the delete preview modal. */
  async openDeleteDialog(name: string) {
    await this.page.getByLabel(`删除 ${name}`).click();
    await expect(
      this.page.locator(".ant-modal-title").filter({ hasText: "删除影响预览" }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Wait for the Safe Operations preview to finish computing. The change set
   * computes asynchronously; while computing, the modal shows "正在计算影响范围…"
   * and the "应用变更" button stays disabled. When done, either the button
   * becomes enabled (no blockers) or a blocker alert appears. We resolve once
   * either happens, returning whether the apply is currently possible.
   */
  async waitForPreviewSettled(timeoutMs = 90_000): Promise<{ canApply: boolean }> {
    const applyButton = this.page.getByRole("button", { name: "应用变更" });
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const enabled = await applyButton.isEnabled().catch(() => false);
      const blockerCount = await this.page.locator(".ant-modal .ant-alert-error").count();
      if (enabled || blockerCount > 0) {
        return { canApply: enabled };
      }
      await this.page.waitForTimeout(3000);
    }
    return { canApply: false };
  }

  /**
   * Drive the full Safe Operations apply flow:
   *  1. wait for the impact preview to finish computing ("应用变更" enabled)
   *  2. click "应用变更"
   *  3. confirm the second modal "确认应用变更" with OK "确认应用"
   */
  async applyDelete() {
    const applyButton = this.page.getByRole("button", { name: "应用变更" });
    // The change set computes asynchronously; the button is disabled until
    // the preview status flips to "ready". Poll its enabled state.
    await expect(applyButton).toBeEnabled({ timeout: 45_000 });
    await applyButton.click();

    // Second confirmation modal.
    await expect(
      this.page.locator(".ant-modal-title").filter({ hasText: "确认应用变更" }),
    ).toBeVisible({ timeout: 10_000 });
    await this.page.getByRole("button", { name: "确认应用" }).click();
  }

  /** Assert the "删除任务已提交" notification surfaces after applying. */
  async expectDeleteSubmitted() {
    await expect(
      this.page.locator(".ant-notification-notice").filter({ hasText: "删除任务已提交" }),
    ).toBeVisible({ timeout: 15_000 });
  }
}
