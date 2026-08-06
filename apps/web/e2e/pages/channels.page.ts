import { expect, type Locator, type Page } from "@playwright/test";
import { waitForReady } from "../fixtures";

/**
 * Page object for /dashboard/channels (routes/dashboard/channels/index.tsx) and
 * the detail page /dashboard/channels/$channelId.
 *
 * "隐藏" in the product sense means a *lifecycle* transition (channel moves
 * to the 「已隐藏」tab and stops being output). There are two UI paths:
 *  1. Batch: row checkboxes → toolbar "隐藏" button → confirm modal.
 *  2. Single (detail page): "生命周期" dropdown → "隐藏" → confirm modal.
 *
 * The per-row eye icon only toggles the `hidden` *field* (a quick visibility
 * switch that does NOT change lifecycle/tab), so it is not covered here.
 *
 * Row targeting uses `data-row-key` (the channel id) — channel names like
 * "cctv1" are substrings of "cctv12" and would over-match with hasText.
 */
export class ChannelsPage {
  readonly page: Page;
  readonly lifecycleTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.lifecycleTab = page.locator(".ant-tabs");
  }

  async goto() {
    await this.page.goto("/dashboard/channels");
    await waitForReady(this.page);
  }

  async gotoDetail(channelId: string) {
    await this.page.goto(`/dashboard/channels/${channelId}`);
    await waitForReady(this.page);
  }

  /** Click a lifecycle tab by label prefix, e.g. "已隐藏". */
  async switchTab(labelPrefix: string) {
    const tab = this.lifecycleTab.getByRole("tab", { name: new RegExp(labelPrefix) });
    await tab.click();
    await waitForReady(this.page);
  }

  private row(channelId: string): Locator {
    return this.page.locator(`.ant-table-row[data-row-key="${channelId}"]`);
  }

  async expectRowVisible(channelId: string) {
    await expect(this.row(channelId)).toBeVisible({ timeout: 15_000 });
  }

  async expectRowAbsent(channelId: string) {
    await expect(this.row(channelId)).toHaveCount(0, { timeout: 15_000 });
  }

  /** Select rows via their row checkbox. */
  async selectChannels(channelIds: string[]) {
    for (const id of channelIds) {
      await this.row(id).locator("input[type='checkbox']").check({ force: true });
    }
    // The batch toolbar renders once selection is non-empty.
    await expect(this.page.getByText(/已选 \d+ 个频道/)).toBeVisible({ timeout: 10_000 });
  }

  /** Click the batch "隐藏" toolbar button and confirm the modal. */
  async batchHide() {
    // The toolbar 隐藏 button renders as icon + visible "隐藏" text, so its
    // accessible name is "eye-invisible 隐藏". The per-row toggle buttons are
    // icon-only with aria-label "隐藏" (no icon name in the name). This name
    // uniquely identifies the toolbar button.
    await expect(this.page.getByText(/已选 \d+ 个频道/)).toBeVisible({ timeout: 10_000 });
    await this.page.getByRole("button", { name: "eye-invisible 隐藏" }).click();
    await this.confirmLifecycleModal("确认隐藏");
  }

  /** On the detail page: open the "生命周期" dropdown and pick "隐藏". */
  async detailHide() {
    await this.page.getByRole("button", { name: /生命周期/ }).click();
    await this.page.getByRole("menuitem", { name: "隐藏" }).click();
    await this.confirmLifecycleModal("确认隐藏");
  }

  /** On the detail page: open the "生命周期" dropdown and pick "恢复输出". */
  async detailRestore() {
    await this.page.getByRole("button", { name: /生命周期/ }).click();
    await this.page.getByRole("menuitem", { name: "恢复输出" }).click();
    await this.confirmLifecycleModal("确认恢复输出");
  }

  /** Common: the lifecycle confirm modal (title "确认X", OK button text "X"). */
  private async confirmLifecycleModal(titlePrefix: string) {
    await expect(
      this.page.locator(".ant-modal-title").filter({ hasText: new RegExp(titlePrefix) }),
    ).toBeVisible({ timeout: 10_000 });
    await this.page.locator(".ant-modal-footer .ant-btn-primary").click();
    await waitForReady(this.page);
  }

  /** Assert the antd message toast for the batch update count. */
  async expectBatchMessage(count: number) {
    await expect(
      this.page.locator(".ant-message").filter({ hasText: `已更新 ${count} 个频道` }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Assert a lifecycle-success message (detail page, e.g. "已隐藏 已更新"). */
  async expectLifecycleMessage(label: string) {
    await expect(
      this.page.locator(".ant-message").filter({ hasText: `${label} 已更新` }),
    ).toBeVisible({ timeout: 15_000 });
  }
}
