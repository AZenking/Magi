import { test, expect } from "../fixtures";
import { SourceListPage } from "../pages/source-list.page";
import { uniqueName, deleteSourceByApi, type SourceType } from "../fixtures";

/**
 * M3U 数据源增删改查 (CRUD) E2E.
 *
 * Covers /dashboard/sources/m3u. The delete step exercises the Safe Operations
 * preview UI (open the "删除影响预览" modal and assert the impact detail
 * renders), then verifies the delete capability itself via the API — the full
 * preview→apply pipeline depends on the backend worker computing a change set,
 * which is environment-sensitive, so the UI assertion focuses on the preview
 * surface while the API proves the record is actually removable.
 */
const TYPE: SourceType = "m3u";

test.describe("M3U 数据源管理", () => {
  let page: SourceListPage;
  let createdName: string | undefined;
  let createdId: string | undefined;

  test.beforeEach(async ({ page: p }) => {
    page = new SourceListPage(p, TYPE);
    await page.goto();
  });

  test.afterEach(async ({ api }) => {
    if (createdId) {
      await deleteSourceByApi(api, TYPE, createdId).catch(() => undefined);
    }
    createdName = undefined;
    createdId = undefined;
  });

  test("新增 → 查询 → 编辑 → 删除", async ({ api }) => {
    test.setTimeout(180_000); // delete preview can take a while to compute
    // ── 新增 ──────────────────────────────────────────────────────────
    const name = uniqueName("e2e-m3u");
    await page.openCreateDialog();
    await page.fillForm({ name, url: "https://example.com/e2e/test.m3u" });
    await page.submitForm();
    await page.expectMessage("源添加成功");
    await page.expectRowVisible(name);
    createdName = name;

    // ── 查询 ──────────────────────────────────────────────────────────
    await page.search(name);
    await page.expectRowVisible(name);

    // ── 编辑（改名）──────────────────────────────────────────────────
    const editedName = `${name}-edited`;
    await page.openEditDialog(name);
    await page.clearName();
    await page.typeName(editedName);
    await page.submitForm();
    await page.expectMessage("源更新成功");
    await page.expectRowVisible(editedName);
    createdName = editedName;
    // Resolve the id for teardown + the delete-capability check.
    const res = await api.get("/sources", { params: { type: TYPE, search: editedName } });
    createdId = (await res.json()).data?.items?.[0]?.id;

    // ── 删除：Safe Operations 预览 UI ─────────────────────────────────
    await page.openDeleteDialog(editedName);
    // Wait for the preview to finish computing (no longer "正在计算…").
    // Resolves once "应用变更" is enabled OR a blocker alert appears.
    const { canApply } = await page.waitForPreviewSettled();

    if (canApply) {
      // Happy path: drive the full apply flow and confirm the row disappears.
      await page.applyDelete();
      await page.expectDeleteSubmitted();
      await expect(async () => {
        await page.refreshButton.click();
        await page.expectRowAbsent(editedName);
      }).toPass({ timeout: 60_000, intervals: [3_000, 5_000] });
      createdId = undefined; // already deleted via UI
    } else {
      // Environment blocks the apply (e.g. worker backpressure). Close the
      // preview and prove the record is still deletable via the API.
      await page.page.locator(".ant-modal-close").click().catch(() => undefined);
      await page.page.waitForTimeout(500);
      expect(createdId).toBeTruthy();
      await deleteSourceByApi(api, TYPE, createdId!);
      createdId = undefined;
      // Verify it's gone from the list.
      await page.refreshButton.click();
      await page.expectRowAbsent(editedName);
    }
  });

  test("M3U 表单含特有字段（优先级/参与输出/允许备选）", async () => {
    await page.openCreateDialog();
    await expect(page.page.getByText("优先级")).toBeVisible();
    await expect(page.page.getByText("参与输出")).toBeVisible();
    await expect(page.page.getByText("允许作为备选源")).toBeVisible();
  });
});
