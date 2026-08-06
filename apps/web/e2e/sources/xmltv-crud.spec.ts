import { test, expect } from "../fixtures";
import { SourceListPage } from "../pages/source-list.page";
import { uniqueName, deleteSourceByApi, type SourceType } from "../fixtures";

/**
 * XMLTV 数据源增删改查 (CRUD) E2E.
 *
 * Mirrors the M3U spec against /dashboard/sources/xmltv. The XMLTV form omits
 * the m3u-only fields (priority / participate / fallback), which we assert in
 * the create step. Delete uses the same preview-UI + API-capability approach.
 */
const TYPE: SourceType = "xmltv";

test.describe("XMLTV 数据源管理", () => {
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
    } else if (createdName) {
      const res = await api.get("/sources", { params: { type: TYPE, search: createdName } });
      const items = (await res.json()).data?.items ?? [];
      await Promise.all(
        items.map((s: { id: string }) =>
          deleteSourceByApi(api, TYPE, s.id).catch(() => undefined),
        ),
      );
    }
    createdName = undefined;
    createdId = undefined;
  });

  test("新增 → 查询 → 编辑 → 删除", async ({ api }) => {
    test.setTimeout(180_000);
    // ── 新增 ──────────────────────────────────────────────────────────
    const name = uniqueName("e2e-xmltv");
    await page.openCreateDialog();
    // XMLTV form must NOT show m3u-only fields.
    await expect(page.page.getByText("优先级")).toHaveCount(0);
    await page.fillForm({ name, url: "https://example.com/e2e/test.xml" });
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
    const res = await api.get("/sources", { params: { type: TYPE, search: editedName } });
    createdId = (await res.json()).data?.items?.[0]?.id;

    // ── 删除：Safe Operations 预览 UI ─────────────────────────────────
    await page.openDeleteDialog(editedName);
    const { canApply } = await page.waitForPreviewSettled();

    if (canApply) {
      await page.applyDelete();
      await page.expectDeleteSubmitted();
      await expect(async () => {
        await page.refreshButton.click();
        await page.expectRowAbsent(editedName);
      }).toPass({ timeout: 60_000, intervals: [3_000, 5_000] });
      createdId = undefined;
    } else {
      await page.page.locator(".ant-modal-close").click().catch(() => undefined);
      await page.page.waitForTimeout(500);
      expect(createdId).toBeTruthy();
      await deleteSourceByApi(api, TYPE, createdId!);
      createdId = undefined;
      await page.refreshButton.click();
      await page.expectRowAbsent(editedName);
    }
  });
});
