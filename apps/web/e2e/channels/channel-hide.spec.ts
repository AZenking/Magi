import { test, expect } from "../fixtures";
import { ChannelsPage } from "../pages/channels.page";
import {
  listChannelsByApi,
  getChannelByApi,
  restoreChannelByApi,
  type ChannelVo,
} from "../fixtures";

/**
 * 输出频道隐藏 E2E.
 *
 * "隐藏" = lifecycle 转换到 hidden（频道移入「已隐藏」tab、停止输出）。覆盖：
 *  - 单条：详情页「生命周期」下拉 → 隐藏 → 确认，再恢复。
 *  - 批量：列表勾选 → 工具栏「隐藏」→ 确认。
 *
 * 断言策略（混合）：UI 触发操作并断言成功 toast + 频道离开当前 tab；用 API
 * 精确断言 lifecycle 已切换。之所以不全靠 UI 的「已隐藏」tab 找行，是因为
 * 该 tab 可能有上千条数据，被测频道基本不在默认第一页。
 *
 * 需要环境里已有 active 频道（同步过一个源即可）。无数据时优雅 skip。
 */
// .serial so the two specs run in declaration order on one worker (they share
// the channel pool and may seed/restore rows from the hidden lifecycle).
test.describe.serial("输出频道隐藏", () => {
  let page: ChannelsPage;
  let touched: ChannelVo[] = [];

  test.beforeEach(async ({ page: p }) => {
    page = new ChannelsPage(p);
    touched = [];
  });

  test.afterAll(async ({ api }) => {
    await Promise.all(
      touched.map((ch) => restoreChannelByApi(api, ch, "active").catch(() => undefined)),
    );
  });

  test("单条隐藏：详情页隐藏后 lifecycle=hidden，恢复后回到输出中", async ({ api }) => {
    test.setTimeout(120_000);
    // Need ≥1 active channel. Seed from the hidden pool if the environment
    // has none (common in this dev DB where most channels are hidden).
    let actives = await listChannelsByApi(api, { lifecycle: "active", pageSize: 5 });
    let seeded: ChannelVo | undefined;
    if (actives.length === 0) {
      const hiddenPool = await listChannelsByApi(api, { lifecycle: "hidden", pageSize: 5 });
      if (hiddenPool.length === 0) {
        test.skip(true, "环境无频道数据");
        return;
      }
      seeded = hiddenPool[0];
      if (seeded) {
        await restoreChannelByApi(api, seeded, "active").catch(() => undefined);
      }
      actives = await listChannelsByApi(api, { lifecycle: "active", pageSize: 5 });
    }
    const target = actives[0];
    if (!target) {
      test.skip(true, "无法获取 active 频道");
      return;
    }
    touched.push(target);

    // ── 详情页：隐藏 ──────────────────────────────────────────────
    await page.gotoDetail(target.id);
    await page.detailHide();
    await page.expectLifecycleMessage("已隐藏");

    // 隐藏成功：lifecycle 已变为 hidden（API 精确断言，不受列表分页影响）。
    const hidden = await getChannelByApi(api, target.id);
    expect(hidden.lifecycle).toBe("hidden");

    // 它已不在「输出中」tab（UI 断言：active 列表里找不到这行）。
    await page.goto();
    await page.switchTab("输出中");
    await page.expectRowAbsent(target.id);

    // ── 详情页：恢复输出 ──────────────────────────────────────────
    await page.gotoDetail(target.id);
    await page.detailRestore();
    await page.expectLifecycleMessage("输出中");

    const restored = await getChannelByApi(api, target.id);
    expect(restored.lifecycle).toBe("active");

    // 回到「输出中」tab 能看到它（active 通常很少，会在第一页）。
    await page.goto();
    await page.switchTab("输出中");
    await page.expectRowVisible(target.id);

    // If we seeded this channel from the hidden pool, return it to hidden so
    // the environment is left untouched.
    if (seeded) {
      const latest = await getChannelByApi(api, seeded.id);
      await restoreChannelByApi(api, latest, "hidden").catch(() => undefined);
    }
  });

  test("批量隐藏多个频道", async ({ api }) => {
    // Includes data prep (API restore) + UI flow; give it room.
    test.setTimeout(120_000);
    // 批量需要 ≥2 个 active 频道。环境不足时，从 hidden 池临时恢复 2 个到
    // active 作为测试数据，测后还原为 hidden（避免污染环境）。
    let actives = await listChannelsByApi(api, { lifecycle: "active", pageSize: 10 });
    const seeded: ChannelVo[] = [];
    if (actives.length < 2) {
      const hidden = await listChannelsByApi(api, { lifecycle: "hidden", pageSize: 5 });
      if (hidden.length < 2) {
        test.skip(true, "环境频道总数不足，无法准备批量测试数据");
        return;
      }
      for (const ch of hidden.slice(0, 2 - actives.length)) {
        await restoreChannelByApi(api, ch, "active").catch(() => undefined);
        seeded.push({ ...ch, lifecycle: "active" });
      }
      actives = await listChannelsByApi(api, { lifecycle: "active", pageSize: 10 });
    }
    if (actives.length < 2) {
      test.skip(true, "无法获取 2 个 active 频道");
      return;
    }

    const targets = actives.slice(0, 2);
    for (const ch of targets) touched.push(ch);
    const ids = targets.map((c) => c.id);

    await page.goto();
    await page.switchTab("输出中");
    for (const id of ids) await page.expectRowVisible(id);

    await page.selectChannels(ids);
    await page.batchHide();
    await page.expectBatchMessage(ids.length);

    // 每个被隐藏频道的 lifecycle 都已变为 hidden（API 精确断言）。
    for (const id of ids) {
      const ch = await getChannelByApi(api, id);
      expect(ch.lifecycle).toBe("hidden");
    }

    // 它们已离开「输出中」tab。
    await page.switchTab("输出中");
    for (const id of ids) await page.expectRowAbsent(id);

    // 还原临时 seed 的频道到它们原来的 hidden 状态。
    for (const ch of seeded) {
      await restoreChannelByApi(api, ch, "hidden").catch(() => undefined);
    }
  });
});
