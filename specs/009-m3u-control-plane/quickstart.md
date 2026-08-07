# Validation Quickstart: M3U 控制台

本指南验证“来源 → 编排 → 输出”的端到端行为。实现完成后按此顺序执行。

## Prerequisites

1. 在仓库根目录运行 `bash scripts/init-dev.sh`，准备本地数据库和队列。
2. 使用 `pnpm install` 安装工作区依赖，并启动 API、Worker 与 Web 管理端。
3. 准备以下可控测试 M3U 内容：两个带相同 `tvg-id` 的频道、两个仅名称相近的频道、一个有两条线路的最终频道，以及用于模拟 25% 删除和空目录的后续版本。
4. 创建一个可撤销的输出资格，以及一个已授权的 Android TV/设备客户端（用于播放回报验证）。

## Scenario 1 — Normal source update is automatic and stable

1. 创建并启用测试 M3U 源，触发同步。
2. 确认 change set 为正常差异并自动应用。
3. 在最终频道目录中修改名称、分组、主线路和可见性。
4. 更新来源中的线路地址，再次同步。

**Expected**: 来源频道、最终频道与线路保持稳定身份；人工设置和健康历史保留；来源线路地址更新可追溯。

## Scenario 2 — Anomaly guard protects the last good directory

1. 为已有来源提供空列表，或使本次删除数达到现有条目的 25%。
2. 触发定时或手动同步。
3. 在管理端查看 change set 和输出状态。

**Expected**: change set 标记为需要确认；最终目录和已发布 M3U 保持上一次可用状态；确认前不会产生来源缺失或输出排除变更。

## Scenario 3 — Conservative composition and manual review

1. 同步含相同 `tvg-id` 的两个来源条目。
2. 同步只有相似名称/分组的另一个条目。
3. 查看最终目录与合并候选；接受一个候选，拒绝另一个。

**Expected**: 相同 `tvg-id` 自动合并；弱信号只显示为候选；接受后创建稳定手动关系，拒绝后相同输入不重复出现。

## Scenario 4 — Missing-line retention and restoration

1. 从来源删除最终频道的一条来源线路并同步。
2. 读取最终输出和线路详情。
3. 在 30 天保留窗口内恢复该线路并再次同步。
4. 使用测试时钟或清理任务验证超过 30 天的未恢复线路。

**Expected**: 缺失线路立即不在输出中但保留审计与健康；恢复时复用身份与历史；30 天后只清理自动来源关系与来源线路，不删除仍有可用线路或人工线路的最终频道。

## Scenario 5 — Per-player output access

1. 创建两个独立输出资格，使用第一个资格读取动态 M3U。
2. 撤销第一个资格并再次请求；使用第二个资格请求。
3. 在日志、审计和管理列表中检查密钥脱敏。

**Expected**: 第一个请求被拒绝，第二个继续可用；明文凭据只在签发/轮换响应中出现；输出状态显示正确 revision 与新鲜度。

## Scenario 6 — Unified health and failover

1. 对主线路执行单线路健康检查，并确认仅目标线路被检查。
2. 从已授权设备上报同一频道主线路的失败，随后上报备用线路成功。
3. 连续达到该频道的失败阈值，读取播放决策与 M3U 输出。

**Expected**: 频道与线路归属不匹配的上报不改变健康；主动与被动证据均可追溯；主线路、故障切换事件和输出排序在同一决策后保持一致。

## Validation Matrix

| Scenario | Fixture | US | Key Assertion | Owner Module |
|---|---|---|---|---|
| Normal source update is automatic and stable | `normal.m3u` → `normal-v2.m3u` | US1 | Stable identity, manual fields preserved, address update traceable | worker/operation-safety |
| Anomaly guard — empty directory | `baseline-four.m3u` → `empty.m3u` | US1 | `requiresConfirmation=true`, last-good directory retained | worker/operation-safety |
| Anomaly guard — 25% deletion | `baseline-four.m3u` → `deletion-25-percent.m3u` | US1 | `requiresConfirmation=true`, missing ratio ≥ 0.25 warning | backend-core/operation-diff |
| Same-tvg-id auto merge | `same-tvg-id.m3u` | US2 | Single canonical channel with two streams, no candidate | worker/canonical-reconcile |
| Weak-match candidate | `weak-match.m3u` | US2 | Two pending `MergeCandidate` rows, no silent merge | api/output-composition |
| Missing line retention + reappearance | `reappearing-line.m3u` → `line-disappears.m3u` → `reappearing-line.m3u` | US2 | Missing stream excluded from output, identity reused on restore | worker/cleanup-operation-state |
| Single-stream probe scope | (runtime stream) | US3 | Job targets `streamId`, not `sourceId`; observation recorded | worker/stream-check.processor |
| Playback report ownership | (runtime request) | US3 | Mismatched `channel_id`/`stream_id` ignored; valid report updates health | api/open/report-playback |
| Per-player grant lifecycle | (runtime grant) | US4 | Revoked grant returns 401, second grant still works, plaintext shown once | api/output-grant + open/playlist |
| Publication status transitions | (apply/apply-failed/no-output) | US4 | fresh → stale (apply failed, last-good kept) → blocked (no stream) | api/output-publication |

## Required Local Commands

```bash
# One-time environment bootstrap (database + redis + workspaces).
bash scripts/init-dev.sh

# Install workspace dependencies (pnpm workspace + turbo).
pnpm install

# Run all three apps in dev (API on :3001, Worker, Web on :3000) — separate shells.
pnpm dev

# Useful single-app dev commands.
pnpm --filter @magi/api dev
pnpm --filter @magi/worker dev
pnpm --filter @magi/web dev

# Reset local DB / Redis between full runs.
bash scripts/init-dev.sh --reset
```

> Tip: Most scenarios drive the pipeline through the API. The Worker must be running so prepare/apply/cleanup jobs are picked up. Wait for `output_publications.status` to flip to `fresh` (or `stale`/`blocked` per scenario) before reading the public playlist URL.

## Quality Gates

```bash
pnpm lint
pnpm build
pnpm --filter @magi/api test
pnpm --filter @magi/worker test
pnpm --filter @magi/web test
```

还应覆盖来源同步、异常保护、候选审查、30 天清理、grant 撤销、单线路检查、播放上报归属与主动/被动故障切换的一组集成测试。涉及开放接口时，更新 `/api/open.json` 并验证 Android TV 的契约兼容性。

## Outcome Log

> Record each scenario's run result here as the implementation lands (T060). Use one line per run: `<scenario> — <pass|fail|skipped> (<commit>) — note`.

- _pending — Phase 1+2 foundation only; scenarios will run as US1–US4 land._
