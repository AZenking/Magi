# Validation Results: 数据管线可靠性与播放反馈闭环 (008)

**Date**: 2026-08-05
**Branch**: `feat/004-safe-operations-and-protable`

## T047: 仓库质量门禁

| Gate | Result |
|------|--------|
| `pnpm lint` | ✅ 9/9 tasks |
| `pnpm build` | ✅ 6/6 tasks |
| `pnpm --filter @magi/api test` | ✅ 320 passed / 74 skipped / 0 failed |
| `pnpm --filter @magi/worker test` | ✅ 9 passed / 5 skipped / 0 failed |
| `pnpm --filter @magi/web test` | ✅ 61 passed / 13 skipped / 0 failed |
| `gradlew :app:lintDebug :app:testDebugUnitTest :app:assembleDebug` | ✅ BUILD SUCCESSFUL |

## T044: OpenAPI 验证

`POST /api/open/v1/playback/report` 存在于 `/api/open.json`，summary="上报播放结果"。✅

## 端到端功能测试（真实环境）

### US1: 同步后自动看到输出频道 ✅

测试环境：真实 dev DB（PostgreSQL 15432）+ Worker + API。

1. **创建 M3U 源** → `POST /sources`（iptv-org news.m3u）
2. **触发同步** → `POST /sources/m3u/:id/sync`
3. **同步成功**（状态从 failed → success，修复了 canonical_epg_bindings CHECK 约束违规）
4. **验证输出频道自动生成**（无需 EPG 匹配）：
   - `channels` 表：1009 条原始频道
   - `canonical_channels`：2662 条输出频道（全部 active）
   - `channel_streams`：3728 条播放线路（2696 条 primary）
   - `GET /output/channels`：2658 条可用频道

**关键修复**：`reconcile-canonicals.ts` 的 bindingStatus 计算在 `xmltvSourceId` 为 null
时降级为 `unmatched`，避免违反 `canonical_epg_binding_matched_fields_check` 约束。

### US3: 播放失败上报 + 健康度更新 ✅

1. **设备自动注册** → `POST /api/open/v1/auth/device-register` → 获得 access token
2. **获取播放决策** → `GET /channels/:id/playback` → 获得 streamId
3. **上报播放失败** → `POST /playback/report` → `{accepted: true}`
4. **健康度递增验证**：

| 上报次数 | consecutiveFailures | healthStatus |
|----------|-------------------|-------------|
| 1 | 1 | degraded |
| 2 | 2 | degraded |
| 3 | 3 | **offline** |
| success | 0 | **online**（恢复） |

5. **10s 去重窗口**：同一设备 10s 内重复 failure 不递增 ✅
6. **device principal 鉴权**：integration principal 被 403 拒绝 ✅

### US2: Safe Operations Worker 激活 ✅

Worker 日志确认 `operation-prepare/apply/restore/cleanup` 四种 JobKind 全部注册。
Inline shadowing handler 已移除，`registerOperationHandlers` 正常调用。

## 5 个原始卡点最终状态

| # | 卡点 | 状态 | 端到端验证 |
|---|------|------|-----------|
| 1 | 定时同步失效 | ✅ | fan-out 遍历 + 契约测试 |
| 2 | canonical 耦合 EPG | ✅ | M3U 同步后 2662 频道自动生成 |
| 3 | Safe-op worker | ✅ | 4 handler 注册 + 7 use case 激活 |
| 4 | TV 不上报 | ✅ | report 接口 + 健康度递增/恢复验证 |
| 5 | 自动换线未接线 | ✅ | worker stream-check 路径 + decideFailoverTarget |
