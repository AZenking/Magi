# Tasks: 安全运营工作流

**Input**: Design documents from `/specs/004-safe-operations-workflow/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: 本特性必须遵循宪法规定的 Red-Green-Refactor。每个用户故事先完成并运行其测试任务，确认测试在实现前按预期失败，再开始实现任务。

**Organization**: 任务按用户故事组织，使每个故事都能独立验收。共享契约、数据结构、差异引擎、幂等、恢复点和 Worker 执行框架放入阻塞基础阶段。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可在不同文件中并行执行，且不依赖未完成任务
- **[Story]**: 对应 `spec.md` 中的用户故事
- 每个任务都包含明确文件路径

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立测试、验证和 UI 调研基础，不改变现有业务行为

- [X] T001 运行 `antd design.md --format json`（宪法 2.2.0 强制）以及 Table、Modal、Form、Steps、Tabs、Badge、Alert、Drawer、Progress 组件的 `antd info/demo` 查询，并将本特性采用的 v6 API、token 和交互约束记录到 `specs/004-safe-operations-workflow/antd-research.md`。除 API/token 外，必须额外摘录并固化为 UI 实现硬约束的 antd v6 视觉语言（`design.md`）：(1) 四大价值观 Natural/Certain/Meaningful/Growing —— 视觉冲突按此裁决；(2) 颜色 token —— 主色 `#1677FF`、4 个语义色、中性文字 `rgba(0,0,0,α)` 四档（0.88/0.65/0.45/0.25）、三层 surface，禁止硬编码 `#FFFFFF`/`#FAFAFA`；(3) 排版 —— 基础字号 14px、仅 400/600 两档字重；(4) 4px 网格 —— spacing 仅允许 4/8/16/24/32px，禁止 magic number；(5) 圆角 —— Controls 6px / Surfaces 8px / Tags·Tooltip 4px，`rounded.full` 仅用于 avatar/badge/dot；(6) 动效 —— 仅 Fast 0.1s / Mid 0.2s / Slow 0.3s 与预定义 easing，禁止自定义 `cubic-bezier`；(7) Do's & Don'ts —— 每屏仅一个 primary button、preset 色板仅用于 tag/chart、禁止绕过 token/algorithm/theme.components/CSS variables 自定义 CSS
- [X] T002 [P] 为 Worker 增加 Vitest test script 和配置，修改 `apps/worker/package.json` 并创建 `apps/worker/vitest.config.ts`
- [X] T003 [P] 完成固定种子的 1k/10k 安全运营数据集 seed/verify/reset、全量规范化摘要、人工状态校验和使用说明，写入 `scripts/validation/safe-operations-fixture.ts` 与 `scripts/validation/README.md`
- [X] T004 [P] 创建 API 数据库集成测试事务/清理辅助工具，写入 `apps/api/src/test/database-test-context.ts`
- [X] T005 [P] 创建 Web operation/task/channel/schedule 测试 fixture builders，写入 `apps/web/src/test/safe-operations-fixtures.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立所有故事共同依赖的 wire contract、差异算法、持久化模型、错误语义和异步执行边界

**⚠️ CRITICAL**: 本阶段完成前不得开始用户故事实现

### Shared contracts and pure algorithms

- [X] T006 [P] 定义 operation kind/status、change action、task wire status、actor type 等枚举和严格 Zod schema，写入 `packages/types/src/enum/operation.ts` 与 `packages/types/src/dto/operation.ts`
- [X] T007 [P] 定义频道生命周期、来源存在性、线路顺序、故障转移、人工 EPG lock 的 Zod schema，写入 `packages/types/src/enum/channel-lifecycle.ts`、`packages/types/src/enum/failover.ts` 与 `packages/types/src/dto/channel-operations.ts`
- [X] T008 [P] 定义 TaskRef、进度、能力、关系、schedule、audit、backup、recovery 和 dashboard read model schema，写入 `packages/types/src/dto/task-operations.ts`、`packages/types/src/dto/schedule.ts`、`packages/types/src/dto/audit.ts`、`packages/types/src/dto/backup.ts` 与 `packages/types/src/dto/dashboard-operations.ts`
- [X] T009 [P] 定义 RFC 9457 Problem Details、ETag/If-Match、Idempotency-Key 和分页扩展 schema，写入 `packages/types/src/dto/problem-details.ts` 与 `packages/types/src/dto/concurrency.ts`
- [X] T010 更新共享类型出口并删除平行手写 wire 类型，修改 `packages/types/src/dto/index.ts`、`packages/types/src/enum/index.ts` 与 `packages/types/src/index.ts`
- [X] T011 [P] 先编写 fingerprint 规范化、稳定排序和同输入同摘要的失败测试，写入 `packages/backend-core/src/operation-diff/__tests__/fingerprint.test.ts`
- [X] T012 [P] 先编写 add/update/missing/preserve/conflict 分类及人工字段保护的失败测试，写入 `packages/backend-core/src/operation-diff/__tests__/diff-engine.test.ts`
- [X] T013 实现规范化 fingerprint 和纯 change summary 计算，写入 `packages/backend-core/src/operation-diff/fingerprint.ts`、`packages/backend-core/src/operation-diff/diff-engine.ts`、`packages/backend-core/src/operation-diff/types.ts` 与 `packages/backend-core/src/operation-diff/index.ts`
- [X] T014 导出纯差异能力供 API/Worker 共用，修改 `packages/backend-core/src/index.ts`

### Expand database and domain boundaries

- [X] T015 [P] 创建 snapshot、change set/item 和 operation lease schema；snapshot item 使用 `(snapshotId, channelIdentity, collisionOrdinal)` 与 `(snapshotId, itemOrder)` 唯一约束，重复 identity 按稳定来源顺序编号并整体标记为 conflict；写入 `packages/backend-core/src/database/schema/source-import-snapshots.ts`、`packages/backend-core/src/database/schema/source-import-snapshot-items.ts`、`packages/backend-core/src/database/schema/operation-change-sets.ts`、`packages/backend-core/src/database/schema/operation-change-items.ts` 与 `packages/backend-core/src/database/schema/operation-leases.ts`
- [X] T016 [P] 创建 recovery point/item、audit event、outbox event 和 idempotency record schema，写入 `packages/backend-core/src/database/schema/recovery-points.ts`、`packages/backend-core/src/database/schema/recovery-point-items.ts`、`packages/backend-core/src/database/schema/audit-events.ts`、`packages/backend-core/src/database/schema/outbox-events.ts` 与 `packages/backend-core/src/database/schema/idempotency-records.ts`
- [X] T017 [P] 在唯一共享来源中扩展来源、来源频道、标准频道、人工覆盖和任务表的 version、presence、lifecycle、lock、trace/result 字段，并创建 canonical member/identity alias schema；修改 `packages/backend-core/src/database/schema/m3u-sources.ts`、`packages/backend-core/src/database/schema/xmltv-sources.ts`、`packages/backend-core/src/database/schema/channels.ts`、`packages/backend-core/src/database/schema/canonical-channels.ts`、`packages/backend-core/src/database/schema/channel-overrides.ts`、`packages/backend-core/src/database/schema/sync-logs.ts`，创建 `packages/backend-core/src/database/schema/canonical-channel-members.ts` 与 `packages/backend-core/src/database/schema/source-channel-identity-aliases.ts`；API schema 入口只允许 re-export 共享定义，修改 `apps/api/src/infrastructure/database/schema/index.ts`
- [X] T018 [P] 在唯一共享来源中创建持久 schedule、config backup 和 channel failover policy schema，并扩展 stream 的 position/origin/eligibility/version；写入 `packages/backend-core/src/database/schema/scheduled-job-configs.ts`、`packages/backend-core/src/database/schema/config-backups.ts`、`packages/backend-core/src/database/schema/channel-failover-policies.ts`，修改 `packages/backend-core/src/database/schema/channel-streams.ts`；删除 API 内平行字段定义并改为 re-export，修改 `apps/api/src/infrastructure/database/schema/channel-streams.ts`
- [X] T019 先编写 schema 单一来源、expand/backfill 重复执行、lifecycle 冲突、重复 identity、稳定成员和 stream position 修复的失败测试，写入 `apps/api/src/infrastructure/database/__tests__/safe-operations-migration.test.ts`；汇总共享 schema 出口并让 API/Worker 仅导入或 re-export，修改 `packages/backend-core/src/database/schema/index.ts`、`apps/api/src/infrastructure/database/schema/index.ts` 与 `apps/worker/src/schema.ts`
- [X] T020 在 T019 测试按预期失败后运行 `pnpm --filter @magi/api db:generate` 生成下一编号的 expand migration，审查 lifecycle 回填、稳定成员迁移、stream position 修复、冲突报告和兼容索引；分别在空库与旧数据 fixture 上运行 `pnpm --filter @magi/api db:migrate` 并重复运行迁移验证幂等/安全失败，将 Drizzle 生成产物写入 `apps/api/drizzle/`，禁止预填迁移编号或手写 `apps/api/drizzle/meta/_journal.json`
- [X] T021 [P] 定义框架无关的 operation/change-set/recovery/lease 状态机和 repository ports，写入 `apps/api/src/domain/operation-safety/operation-change-set.model.ts`、`apps/api/src/domain/operation-safety/recovery-point.model.ts`、`apps/api/src/domain/operation-safety/operation-safety.repository.ts` 与 `apps/api/src/domain/operation-safety/index.ts`
- [X] T022 [P] 扩展频道、来源、任务领域模型和 repository ports 以支持 version、生命周期、稳定 upsert、成员关系、scope/parent/result，修改 `apps/api/src/domain/channel-catalog/channel.model.ts`、`apps/api/src/domain/channel-catalog/channel-catalog.repository.ts`、`apps/api/src/domain/output-composition/canonical-channel.model.ts`、`apps/api/src/domain/output-composition/channel-override.model.ts`、`apps/api/src/domain/output-composition/channel-stream.model.ts`、`apps/api/src/domain/output-composition/output.repository.ts`、`apps/api/src/domain/source-management/source.model.ts`、`apps/api/src/domain/source-management/source.repository.ts`、`apps/api/src/domain/task-execution/task.model.ts`、`apps/api/src/domain/task-execution/task.repository.ts` 与 `apps/api/src/domain/task-execution/task-queue.port.ts`
- [X] T023 [P] 定义 audit/outbox/schedule/backup 领域模型和 repository ports，并在共享 package 中唯一定义 API/Worker 共用的 `BackupObjectStorage` port；写入 `apps/api/src/domain/audit/audit-event.model.ts`、`apps/api/src/domain/audit/audit.repository.ts`、`apps/api/src/domain/audit/index.ts`、`apps/api/src/domain/backup/config-backup.model.ts`、`apps/api/src/domain/backup/backup.repository.ts`、`apps/api/src/domain/backup/index.ts`、`apps/api/src/domain/task-execution/scheduled-job.model.ts` 与 `packages/backend-core/src/backup/backup-object-storage.port.ts`
- [X] T024 实现 change-set/snapshot/recovery/lease/idempotency repositories 及按引用安全过期查询，写入 `apps/api/src/infrastructure/database/operation-change-set.repository.ts`、`apps/api/src/infrastructure/database/source-import-snapshot.repository.ts`、`apps/api/src/infrastructure/database/recovery-point.repository.ts`、`apps/api/src/infrastructure/database/operation-lease.repository.ts` 与 `apps/api/src/infrastructure/database/idempotency.repository.ts`
- [X] T025 [P] 实现 audit/outbox/schedule/backup repositories，写入 `apps/api/src/infrastructure/database/audit-event.repository.ts`、`apps/api/src/infrastructure/database/outbox.repository.ts`、`apps/api/src/infrastructure/database/scheduled-job.repository.ts` 与 `apps/api/src/infrastructure/database/config-backup.repository.ts`
- [X] T026 实现 Problem Details、request ID、If-Match 和 Idempotency-Key HTTP 基础设施，写入 `apps/api/src/shared/http/problem-details.filter.ts`、`apps/api/src/shared/http/request-context.middleware.ts`、`apps/api/src/shared/http/precondition.ts` 与 `apps/api/src/shared/http/idempotency.interceptor.ts`，并在 `apps/api/src/app.module.ts` 注册
- [X] T027 建立 Worker 的完整 Clean Architecture 执行边界：定义框架无关的 job/operation/lease 状态和 repository/queue/storage ports，写入 `apps/worker/src/domain/job-execution/job.model.ts`、`apps/worker/src/domain/job-execution/job-execution.repository.ts`、`apps/worker/src/domain/job-execution/job-queue.port.ts` 与 `apps/worker/src/domain/operation-safety/operation-execution.repository.ts`；让 `apps/worker/src/application/job-runner.ts` 仅依赖这些 ports；将 Drizzle/BullMQ/task progress 实现放入 `apps/worker/src/infrastructure/`，并将 `apps/worker/src/main.ts` 与现有 processors 收敛为只校验 payload 和转交 application 的 bootstrap

**Checkpoint**: 共享契约和 Drizzle schema 均为单一来源；T019 migration tests 先红后绿；空库和旧数据 fixture 均通过 generate/migrate；Worker domain/application 不导入 Drizzle/BullMQ/Node 文件系统，并具备 request/task trace 和安全重放边界

---

## Phase 3: User Story 1 - 安全同步和匹配来源数据 (Priority: P1) 🎯 MVP

**Goal**: 同步和 EPG 匹配先生成无副作用预览，应用后保留人工配置、稳定 ID、线路与健康历史，并可恢复

**Independent Test**: 对带人工改名、EPG lock、隐藏状态、主备线路和健康记录的固定数据执行 M3U preview/apply、EPG preview/apply 和 restore；验证计数准确、人工状态全量保持、重复执行为空差异、同范围任务不重复

### Tests for User Story 1

- [X] T028 [P] [US1] 先编写来源频道稳定 upsert、missing/reappear、identity alias、canonical member 保留及重复 channelIdentity collisionOrdinal/conflict 的 repository 集成失败测试，写入 `apps/api/src/infrastructure/database/__tests__/safe-source-sync.repositories.test.ts`
- [X] T029 [P] [US1] 先编写 M3U preview/apply、stale preview、同输入重放和人工字段保护的 application 失败测试，写入 `apps/api/src/application/operation-safety/__tests__/m3u-sync-operation.test.ts`
- [X] T030 [P] [US1] 先编写 EPG preview/apply 保留 manual lock、canonical ID、manual stream 和 health history 的 application 失败测试，写入 `apps/api/src/application/operation-safety/__tests__/epg-match-operation.test.ts`
- [X] T031 [P] [US1] 先编写 recovery point 创建失败零写入、apply 原子失败和 restore round-trip 的失败测试，写入 `apps/api/src/application/operation-safety/__tests__/recovery-operation.test.ts`
- [X] T032 [P] [US1] 先编写 Worker duplicate/stalled/retry、scope lease、commit-stage cancellation、24 小时 operation state 清理、活动任务/审计引用保护和 application 禁止直接导入 Drizzle/BullMQ/fs 的架构失败测试，写入 `apps/worker/src/application/__tests__/safe-operation-jobs.test.ts`、`apps/worker/src/application/operation-safety/__tests__/cleanup-operation-state.test.ts` 与 `apps/worker/src/application/__tests__/architecture-boundaries.test.ts`
- [X] T033 [P] [US1] 先编写 `/operations/previews`、change-set items/decisions/apply/cancel 的 HTTP 契约失败测试，写入 `apps/api/src/http/operation/__tests__/operation.controller.test.ts`
- [X] T034 [P] [US1] 先编写影响摘要、warning/blocker、任务链接和不乐观修改实体的 Web 失败测试，写入 `apps/web/src/features/dashboard/operations/operation-preview.test.tsx`

### Implementation for User Story 1

- [X] T035 [P] [US1] 实现来源频道 stable upsert、missing 标记、identity alias 和 canonical member repositories，修改 `apps/api/src/infrastructure/database/raw-m3u-channel.repository.ts`、`apps/api/src/infrastructure/database/channel.repository.ts`、`apps/api/src/infrastructure/database/canonical-channel.repository.ts`，创建 `apps/api/src/infrastructure/database/canonical-channel-member.repository.ts` 与 `apps/api/src/infrastructure/database/source-channel-identity-alias.repository.ts`
- [X] T036 [P] [US1] 实现 preview 准备、读取、分页 items、记录 decisions、取消和 apply 编排用例，写入 `apps/api/src/application/operation-safety/prepare-operation-preview.use-case.ts`、`apps/api/src/application/operation-safety/find-operation-change-set.use-case.ts`、`apps/api/src/application/operation-safety/update-change-decisions.use-case.ts`、`apps/api/src/application/operation-safety/cancel-operation-preview.use-case.ts` 与 `apps/api/src/application/operation-safety/apply-operation.use-case.ts`
- [X] T037 [US1] 仅通过 Worker domain ports 和 `packages/backend-core` 实现 M3U staging snapshot、稳定差异计算和原子 upsert apply，写入 `apps/worker/src/application/operation-safety/prepare-m3u-sync.use-case.ts` 与 `apps/worker/src/application/operation-safety/apply-m3u-sync.use-case.ts`
- [X] T038 [US1] 仅通过 Worker domain ports 实现增量 canonical reconciliation，确保 override、lifecycle、人工线路、主线路和健康数据优先保留，写入 `apps/worker/src/application/operation-safety/reconcile-canonical-channels.use-case.ts`
- [X] T039 [US1] 仅通过 Worker domain ports 和 `packages/backend-core` 实现 EPG 候选 staging、四类摘要和只应用已批准 binding 的增量流程，写入 `apps/worker/src/application/operation-safety/prepare-epg-match.use-case.ts` 与 `apps/worker/src/application/operation-safety/apply-epg-match.use-case.ts`
- [X] T040 [P] [US1] 实现按受影响对象创建/校验 recovery point 以及补偿 change set restore，写入 `apps/api/src/application/operation-safety/create-recovery-point.use-case.ts`、`apps/api/src/application/operation-safety/prepare-recovery-restore.use-case.ts` 与 `apps/worker/src/application/operation-safety/apply-recovery-restore.use-case.ts`
- [X] T041 [US1] 实现 Worker operation repository adapters、terminal change set/source snapshot/idempotency record 引用安全清理和过期 lease 活动任务复核；注册 prepare/apply/restore/cleanup jobs、双层去重、2 分钟 scope lease、30 秒 heartbeat 和阶段日志，写入 `apps/worker/src/application/operation-safety/cleanup-operation-state.use-case.ts`、`apps/worker/src/infrastructure/database/operation-execution.repository.ts`、`apps/worker/src/infrastructure/queue/operation-worker.ts`、`apps/worker/src/infrastructure/queue/operation-cleanup-worker.ts` 并修改 `apps/worker/src/infrastructure/queue/worker-bootstrap.ts`
- [X] T042 [US1] 扩展 API 入队适配器以传递 requestId、changeSetId、fingerprint、scope、deduplication ID 和 TaskRef，修改 `apps/api/src/application/task-execution/enqueue-sync.use-case.ts`、`apps/api/src/infrastructure/bullmq/task-queue.adapter.ts` 与 `apps/api/src/infrastructure/bullmq/bullmq.module.ts`
- [X] T043 [US1] 实现 operation HTTP controller/module 并注册 repositories/use cases，写入 `apps/api/src/http/operation/operation.controller.ts`、`apps/api/src/http/operation/operation.module.ts`，修改 `apps/api/src/http/http.module.ts` 与 `apps/api/src/infrastructure/infrastructure.module.ts`
- [X] T044 [P] [US1] 创建 change-set/task 查询 keys、preview/apply mutations 和 target-scoped pending hooks，写入 `apps/web/src/features/dashboard/operations/operation-queries.ts`
- [X] T045 [US1] 创建复用的 impact summary、warnings/blockers、paged item table 和 controlled confirmation UI，写入 `apps/web/src/features/dashboard/operations/operation-preview.tsx` 与 `apps/web/src/features/dashboard/operations/operation-impact-table.tsx`
- [X] T046 [US1] 将 M3U 同步入口改为 preview → confirm → task 流程并保留来源级 loading，修改 `apps/web/src/features/dashboard/sources/source-list-page.tsx`
- [X] T047 [US1] 将 EPG 自动匹配入口改为 preview → confirm → task 基础流程，修改 `apps/web/src/routes/dashboard/epg-matching.tsx`
- [X] T048 [US1] 先完成并评审 expand/backfill/shadow/enable/contract 的开关矩阵、数据门禁、停止条件、负责人和逐步回退步骤，写入 `specs/004-safe-operations-workflow/rollout-runbook.md`；评审通过后再增加新旧同步/匹配 shadow 比对、差异审计和仅按来源启用新写入的配置，写入 `apps/api/src/shared/config/safe-operations.config.ts`、`apps/worker/src/infrastructure/config/safe-operations.config.ts` 并修改 `docker/.env.example`

**Checkpoint**: US1 可独立运行 quickstart Scenario 1–5 和 11；旧输出保持不变直到 change set apply，apply 后人工状态与恢复能力全量通过

---

## Phase 4: User Story 2 - 管理可恢复的频道生命周期 (Priority: P1)

**Goal**: 频道具备 active/hidden/disabled/trashed 单一生命周期、全部状态视图、稳定批量选择、恢复和独立永久 purge

**Independent Test**: 依次隐藏、禁用、移入回收站并恢复频道，在同步/匹配后验证状态不被自动激活；批量确认显示稳定 ID/名称；永久 purge 独立预览且不可通过普通恢复找回

### Tests for User Story 2

- [X] T049 [P] [US2] 先编写合法/非法 lifecycle transitions、purge preconditions 和 sourcePresence 正交性的领域失败测试，写入 `apps/api/src/domain/output-composition/__tests__/channel-lifecycle.test.ts`
- [X] T050 [P] [US2] 先编写单频道转换、批量 preview、trash restore 和 purge apply 的 application 失败测试，写入 `apps/api/src/application/output-composition/__tests__/channel-lifecycle.use-cases.test.ts`
- [X] T051 [P] [US2] 先编写 lifecycle filter、If-Match、batch stable IDs 和 purge 契约失败测试，写入 `apps/api/src/http/output/__tests__/channel-lifecycle.controller.test.ts`
- [X] T052 [P] [US2] 先编写 M3U/XMLTV 输出排除 hidden/disabled/trashed 且保留其配置的失败测试，写入 `apps/api/src/application/output-composition/__tests__/lifecycle-output.test.ts`
- [X] T053 [P] [US2] 先编写状态 tabs、跨分页稳定选择、批量确认、回收站恢复和键盘入口的 Web 失败测试，写入 `apps/web/src/routes/dashboard/channels/channel-lifecycle.test.tsx`

### Implementation for User Story 2

- [X] T054 [P] [US2] 实现 CanonicalChannel lifecycle 状态机、输出资格和 purge invariant，修改 `apps/api/src/domain/output-composition/canonical-channel.model.ts`
- [X] T055 [US2] 实现单项转换、批量 lifecycle change-set、trash restore 和 purge prepare/apply 用例，写入 `apps/api/src/application/output-composition/change-channel-lifecycle.use-case.ts`、`apps/api/src/application/output-composition/prepare-batch-lifecycle.use-case.ts`、`apps/api/src/application/output-composition/restore-trashed-channel.use-case.ts` 与 `apps/api/src/application/output-composition/purge-channel.use-case.ts`
- [X] T056 [US2] 扩展 canonical repository 的 lifecycle/sourcePresence/version 过滤、转换和 trash 查询，修改 `apps/api/src/infrastructure/database/canonical-channel.repository.ts`
- [X] T057 [US2] 扩展频道 HTTP 契约以支持 If-Match lifecycle、全部状态查询、restore 和 purge preview，修改 `apps/api/src/http/output/output.controller.ts` 与 `apps/api/src/http/output/output.module.ts`
- [X] T058 [P] [US2] 更新 M3U/XMLTV 生成用例以统一依据 lifecycle 输出，修改 `apps/api/src/application/output-composition/generate-m3u-output.use-case.ts` 与 `apps/api/src/application/output-composition/generate-xmltv-output.use-case.ts`
- [X] T059 [US2] 重构频道列表的 URL lifecycle/sourcePresence 筛选、按稳定 ID 选择状态，并在回收站行和永久删除确认中展示实际 `purgeAfter`，修改 `apps/web/src/routes/dashboard/channels/index.tsx`
- [X] T060 [P] [US2] 更新频道列与批量操作 UI，显示生命周期、来源缺失和名称清单而非行号，修改 `apps/web/src/features/dashboard/channels/columns.tsx`，创建 `apps/web/src/features/dashboard/channels/channel-lifecycle-actions.tsx`
- [X] T061 [US2] 在频道详情增加隐藏/禁用/回收站恢复动作及独立 purge 预览入口，修改 `apps/web/src/routes/dashboard/channels/$channelId.tsx`

**Checkpoint**: US2 可独立运行 quickstart Scenario 6；hidden/show、disabled/enable、trash/restore 均可达，自动任务不会改写运营生命周期

---

## Phase 5: User Story 3 - 在匹配工作台解决 EPG 差异 (Priority: P2)

**Goal**: 将 EPG 匹配升级为可筛选、可解释、可批量处理并保护人工锁定的运营工作台

**Independent Test**: 使用 exact/fuzzy/conflict/unmatched 数据生成草案，查看 confidence/reason/source，批量接受安全项、人工解决冲突并锁定，再次自动匹配后人工决定保持

### Tests for User Story 3

- [X] T062 [P] [US3] 先编写 exact/fuzzy/conflict/unmatched、confidence 和 reasonCode 的 matcher 失败测试，写入 `packages/backend-core/src/processors/__tests__/epg-matcher-workbench.test.ts`
- [X] T063 [P] [US3] 先编写 XMLTV readiness blockers、decision validation、批量接受和 manual lock 的 application 失败测试，写入 `apps/api/src/application/operation-safety/__tests__/epg-workbench.use-cases.test.ts`
- [X] T064 [P] [US3] 先编写 change items 分类筛选、decision patch、过期/冲突响应的 HTTP 失败测试，写入 `apps/api/src/http/operation/__tests__/epg-workbench.contract.test.ts`
- [X] T065 [P] [US3] 先编写工作台分类计数、候选详情、批量接受、人工锁定和 invalid source CTA 的 Web 失败测试，写入 `apps/web/src/routes/dashboard/epg-matching.test.tsx`

### Implementation for User Story 3

- [X] T066 [P] [US3] 扩展纯 EPG matcher 输出候选、confidence、reasonCode 和冲突详情，修改 `packages/backend-core/src/processors/epg-matcher.ts` 与 `packages/backend-core/src/processors/types.ts`
- [X] T067 [P] [US3] 实现 XMLTV enabled/success/non-empty/fresh readiness 查询及 blocker repair links，写入 `apps/api/src/application/channel-catalog/get-xmltv-source-readiness.use-case.ts`
- [X] T068 [US3] 扩展 EPG preview 生成和 decision validation，支持四类分页、selected 状态及 locked manual conflict，修改 `apps/worker/src/application/operation-safety/prepare-epg-match.use-case.ts` 与 `apps/api/src/application/operation-safety/update-change-decisions.use-case.ts`
- [X] T069 [US3] 扩展人工 EPG binding 用例和 override repository，记录 source、lock、reason 和 version，修改 `apps/api/src/application/output-composition/update-output-channel.use-case.ts`、`apps/api/src/infrastructure/database/channel-override.repository.ts` 与 `apps/api/src/http/output/output.controller.ts`
- [X] T070 [US3] 暴露 XMLTV readiness 和 EPG workbench 所需候选详情，修改 `apps/api/src/http/epg/epg.controller.ts` 与 `apps/api/src/http/epg/epg.module.ts`
- [X] T071 [P] [US3] 创建分类摘要、候选详情和批量 decision 组件，写入 `apps/web/src/features/dashboard/epg/epg-match-summary.tsx`、`apps/web/src/features/dashboard/epg/epg-match-candidates.tsx` 与 `apps/web/src/features/dashboard/epg/epg-match-batch-actions.tsx`
- [X] T072 [US3] 将 EPG 匹配路由重构为来源 readiness + 草案状态 + 分类筛选 + confirm/apply 工作台，修改 `apps/web/src/routes/dashboard/epg-matching.tsx`
- [X] T073 [P] [US3] 对齐频道详情手工绑定 Dialog，显示 XMLTV 来源、节目预览、自动理由、人工 lock 和清除语义，修改 `apps/web/src/features/dashboard/channels/epg-match-dialog.tsx`
- [X] T074 [US3] 为无 XMLTV 来源、未同步、失败、过期和空数据状态增加直接添加/同步/修复入口，修改 `apps/web/src/routes/dashboard/epg-matching.tsx` 与 `apps/web/src/features/dashboard/epg/source-form-dialog.tsx`

**Checkpoint**: US3 可独立运行 quickstart Scenario 7；管理员能解释和处理每种结果，manual lock 在第二次匹配后仍保持

---

## Phase 6: User Story 4 - 可预测地管理任务和调度 (Priority: P2)

**Goal**: Task 成为可追踪一等资源，调度具备显式 Save/Cancel、启停、时区、重叠策略和全局状态

**Independent Test**: 修改调度后取消验证零写入，再保存、停用、启用和立即执行；重叠任务跳过且审计；任务详情展示 scope、进度、父子重试和真实取消能力；离页后 Header 仍更新

### Tests for User Story 4

- [X] T075 [P] [US4] 先编写 task status/capability/retry-root/cancel checkpoint 和 schedule draft invariants 的领域失败测试，写入 `apps/api/src/domain/task-execution/__tests__/task-schedule-models.test.ts`
- [X] T076 [P] [US4] 先编写 schedule save/disable/reconcile/overlap skip/trigger dedupe 的 application 失败测试，写入 `apps/api/src/application/task-execution/__tests__/schedule-management.test.ts`
- [X] T077 [P] [US4] 先编写 task summary/detail/retry/cancel 和 schedule ETag/trigger 的 HTTP 失败测试，写入 `apps/api/src/http/task/__tests__/task-schedule.controller.test.ts`
- [X] T078 [P] [US4] 先编写 BullMQ scheduler reconciliation、scope overlap 和 deduplicated event 的失败测试，写入 `apps/api/src/infrastructure/bullmq/__tests__/scheduler.test.ts`
- [X] T079 [P] [US4] 先编写 schedule Save/Cancel、单卡 loading、任务全局状态和父子详情的 Web 失败测试，写入 `apps/web/src/features/dashboard/tasks/scheduled-tasks-section.test.tsx` 与 `apps/web/src/components/global-task-status.test.tsx`

### Implementation for User Story 4

- [X] T080 [P] [US4] 实现 TaskModel 能力、scope/target/initiator/relations/result 和 wire status 映射，修改 `apps/api/src/domain/task-execution/task.model.ts`
- [X] T081 [P] [US4] 实现 ScheduledJobModel、repository 和持久配置 truth，修改 `apps/api/src/domain/task-execution/scheduled-job.model.ts` 与 `apps/api/src/infrastructure/database/scheduled-job.repository.ts`
- [X] T082 [US4] 重写 schedule 查询、显式保存、启停和 trigger-now 用例，并增加 task summary，用 `If-Match` 和 idempotency，修改 `apps/api/src/application/task-execution/schedule.use-cases.ts`，创建 `apps/api/src/application/task-execution/get-task-summary.use-case.ts`
- [X] T083 [US4] 扩展 retry/cancel/find task 用例以维护 parent/root、capabilities、result links 和 commit-stage cancellation，修改 `apps/api/src/application/task-execution/retry-task.use-case.ts`、`apps/api/src/application/task-execution/cancel-task.use-case.ts`、`apps/api/src/application/task-execution/find-task.use-case.ts` 与 `apps/api/src/application/task-execution/find-tasks.use-case.ts`
- [X] T084 [US4] 以持久 schedule 配置为真相源重构 BullMQ reconciliation 和 overlap skip，修改 `apps/api/src/infrastructure/bullmq/scheduler.ts` 与 `apps/api/src/infrastructure/bullmq/task-queue.adapter.ts`
- [X] T085 [US4] 扩展 Task HTTP 契约为 summary、scope filters、ETag schedule、幂等 trigger/retry/cancel 和 TaskRef，修改 `apps/api/src/http/task/task.controller.ts` 与 `apps/api/src/http/task/task.module.ts`
- [X] T086 [P] [US4] 创建自适应 task summary/detail polling hooks 和 target task registry，写入 `apps/web/src/features/dashboard/tasks/task-queries.ts` 与 `apps/web/src/features/dashboard/tasks/task-registry.ts`
- [X] T087 [US4] 将调度编辑改成受控草稿、显式 Save/Cancel、启停、时区、重叠策略和 next-run，修改 `apps/web/src/features/dashboard/tasks/scheduled-tasks-section.tsx`
- [X] T088 [P] [US4] 更新任务详情展示 stage/progress/capabilities/parent/retry/change-set/recovery/result links，修改 `apps/web/src/features/dashboard/tasks/task-detail-content.tsx`
- [X] T089 [US4] 更新任务列表/详情 mutations 使用 Idempotency-Key 和 task-target pending，修改 `apps/web/src/routes/dashboard/tasks/index.tsx`、`apps/web/src/routes/dashboard/tasks/$taskId.tsx` 与 `apps/web/src/features/dashboard/tasks/columns.tsx`
- [X] T090 [US4] 创建全局运行中/失败/最近完成任务入口并接入 Header，写入 `apps/web/src/components/global-task-status.tsx` 并修改 `apps/web/src/components/app-header.tsx`

**Checkpoint**: US4 可独立运行 quickstart Scenario 8–9；Cancel 不写入、Save 一次写入、重叠任务不积压、跨页面状态持续可见

---

## Phase 7: User Story 5 - 备份、恢复和审计高风险操作 (Priority: P2)

**Goal**: 来源删除、批量变更、同步匹配和配置恢复均具备影响报告、恢复点、审计链和默认脱敏备份

**Independent Test**: 对含频道/节目/映射/线路/调度的来源执行删除 preview，验证 disable-first 和准确计数；创建备份并 round-trip；损坏/未来版本/秘密字段在零写入前被阻止；从任务或审计进入恢复

### Tests for User Story 5

- [X] T091 [P] [US5] 先编写来源删除影响计数、disable-first、恢复点失败零写入和 purge 关系处理的 application 失败测试，写入 `apps/api/src/application/source-management/__tests__/safe-delete-source.test.ts`
- [X] T092 [P] [US5] 先编写 audit/outbox 同事务、追加不可变、关联 task/change-set/recovery 的 repository 失败测试，写入 `apps/api/src/infrastructure/database/__tests__/audit-outbox.repositories.test.ts`
- [X] T093 [P] [US5] 先编写当前/旧版本 backup round-trip、未来版本、checksum、缺失引用、restore rollback、临时文件清理、原子提交、未授权读取、API/Worker adapter storageRef 互通和对象删除失败重试的失败测试，写入 `apps/api/src/application/backup/__tests__/backup-restore.test.ts`、`apps/api/src/infrastructure/backup/__tests__/private-file-backup-object-storage.test.ts` 与 `apps/worker/src/infrastructure/backup/__tests__/private-file-backup-object-storage.test.ts`
- [X] T094 [P] [US5] 先编写 URL/header/token/password/cookie 在 backup、audit、task summary 和 logs 中脱敏的失败测试，写入 `apps/api/src/application/backup/__tests__/backup-redaction.test.ts`
- [X] T095 [P] [US5] 先编写 audit/recovery/backup/source-delete HTTP 契约失败测试，写入 `apps/api/src/http/backup/__tests__/backup.controller.test.ts` 与 `apps/api/src/http/audit/__tests__/audit.controller.test.ts`
- [X] T096 [P] [US5] 先编写来源删除影响 Modal、audit/recovery links、backup preflight 和 restore blockers 的 Web 失败测试，写入 `apps/web/src/features/dashboard/backups/backup-restore.test.tsx` 与 `apps/web/src/features/dashboard/audit/audit-list.test.tsx`

### Implementation for User Story 5

- [X] T097 [US5] 将来源删除改为 impact preview/apply，统计频道、节目、映射、线路和调度并提供 disable alternative，修改 `apps/api/src/application/source-management/delete-source.use-case.ts`，创建 `apps/api/src/application/source-management/prepare-delete-source.use-case.ts`
- [X] T098 [P] [US5] 实现 audit 追加、查询、详情和 outbox 同事务写入/可靠投递，写入 `apps/api/src/application/audit/append-audit-event.use-case.ts`、`apps/api/src/application/audit/find-audit-events.use-case.ts` 与 `apps/worker/src/infrastructure/outbox/outbox-dispatcher.ts`
- [X] T099 [P] [US5] 实现 recovery point 列表/详情/retention/capability 和 30 天引用安全清理，并扩展 T041 的 operation cleanup 测试以确认 recovery/audit 引用会阻止 snapshot/change-set 提前删除；写入 `apps/api/src/application/operation-safety/find-recovery-points.use-case.ts`、`apps/api/src/application/operation-safety/expire-recovery-points.use-case.ts` 与 `apps/worker/src/application/operation-safety/__tests__/cleanup-operation-state.test.ts`
- [X] T100 [P] [US5] 实现版本化 backup manifest、规范化 serializer、checksum 和秘密脱敏，写入 `apps/api/src/application/backup/backup-serializer.ts` 与 `apps/api/src/application/backup/backup-redactor.ts`
- [X] T101 [US5] 实现异步 backup 创建、授权下载和 30 天过期清理用例，以及 API/Worker 两侧消费同一共享 port、指向同一私有存储根的 `BackupObjectStorage` adapters；使用临时文件、checksum/size 校验、fsync、原子 rename 和失败清理，数据库只保存 opaque storageRef，写入 `apps/api/src/application/backup/create-backup.use-case.ts`、`apps/api/src/application/backup/download-backup.use-case.ts`、`apps/api/src/application/backup/expire-backups.use-case.ts`、`apps/api/src/infrastructure/backup/private-file-backup-object-storage.ts` 与 `apps/worker/src/infrastructure/backup/private-file-backup-object-storage.ts`
- [X] T102 [US5] 通过共享 `BackupObjectStorage` port 实现 restore 格式迁移、完整性/引用 preflight、replace apply、verify 和 rollback，写入 `apps/api/src/application/backup/prepare-backup-restore.use-case.ts` 与 `apps/worker/src/application/backup/apply-backup-restore.use-case.ts`
- [X] T103 [US5] 注册 backup/recovery/outbox Worker jobs、对象存储与 recovery 清理重试及阶段日志，写入 `apps/worker/src/infrastructure/queue/backup-worker.ts` 并修改 `apps/worker/src/infrastructure/queue/worker-bootstrap.ts`
- [X] T104 [P] [US5] 实现 backup 与 audit HTTP modules/controllers，写入 `apps/api/src/http/backup/backup.controller.ts`、`apps/api/src/http/backup/backup.module.ts`、`apps/api/src/http/audit/audit.controller.ts` 与 `apps/api/src/http/audit/audit.module.ts`
- [X] T105 [US5] 注册 backup/audit modules 和 repositories，修改 `apps/api/src/http/http.module.ts` 与 `apps/api/src/infrastructure/infrastructure.module.ts`
- [X] T106 [P] [US5] 创建备份列表、实际 `expiresAt`、创建、下载、restore preflight/apply 页面，写入 `apps/web/src/routes/dashboard/backups/index.tsx` 与 `apps/web/src/features/dashboard/backups/backup-restore.tsx`
- [X] T107 [P] [US5] 创建审计列表、详情、任务/change-set/recovery 关联、recovery `expiresAt` 和恢复入口，写入 `apps/web/src/routes/dashboard/audit/index.tsx` 与 `apps/web/src/features/dashboard/audit/audit-list.tsx`
- [X] T108 [US5] 将来源删除交互替换为影响摘要、停用优先和高风险确认，并在导航中加入备份/审计入口，修改 `apps/web/src/features/dashboard/sources/source-list-page.tsx` 与 `apps/web/src/components/app-menu.tsx`

**Checkpoint**: US5 可独立运行 quickstart Scenario 11–12 及来源删除场景；高风险操作可追溯、可恢复，备份兼容性/秘密检查在写入前完成

---

## Phase 8: User Story 6 - 监控数据新鲜度和线路故障转移 (Priority: P3)

**Goal**: Dashboard 展示新鲜度/覆盖率/任务/线路问题并提供修复路径；频道线路具备确定顺序、策略化自动切换和单线路检查

**Independent Test**: 制造来源过期、低 EPG 覆盖、任务失败和主线路故障；验证首页指标与三步内修复路径；配置主备顺序和两种恢复策略，检查切换审计与单线路 loading

### Tests for User Story 6

- [X] T109 [P] [US6] 先编写 stream order、唯一 primary、failover thresholds/cooldown/restore mode 的领域失败测试，写入 `apps/api/src/domain/output-composition/__tests__/channel-failover.test.ts`
- [X] T110 [P] [US6] 先编写 reorder、delete-primary successor、single-stream check 和 automatic switch 的 application 失败测试，写入 `apps/api/src/application/output-composition/__tests__/channel-failover.use-cases.test.ts`
- [X] T111 [P] [US6] 先编写来源新鲜度、EPG/tvg-id 覆盖、线路可用率、任务异常和 actionUrl 的 dashboard 失败测试，写入 `apps/api/src/application/dashboard/__tests__/operations-summary.test.ts`
- [X] T112 [P] [US6] 先编写 stream order/policy/check 及 dashboard summary HTTP 契约失败测试，写入 `apps/api/src/http/output/__tests__/channel-failover.controller.test.ts` 与 `apps/api/src/http/dashboard/__tests__/operations-summary.controller.test.ts`
- [X] T113 [P] [US6] 先编写线路排序/策略/单行检查、首页异常卡和来源生效策略说明的 Web 失败测试，写入 `apps/web/src/features/dashboard/channels/channel-failover.test.tsx` 与 `apps/web/src/routes/dashboard/dashboard-operations.test.tsx`

### Implementation for User Story 6

- [X] T114 [P] [US6] 实现 ChannelFailoverPolicy、stream ordering、primary/successor invariant 和 switch decision，写入 `apps/api/src/domain/output-composition/channel-failover-policy.model.ts` 并修改 `apps/api/src/domain/output-composition/channel-stream.model.ts`
- [X] T115 [P] [US6] 实现 stream position/primary/policy repository 原子更新，修改 `apps/api/src/infrastructure/database/channel-stream.repository.ts`，创建 `apps/api/src/infrastructure/database/channel-failover-policy.repository.ts`
- [X] T116 [US6] 实现 reorder、delete-primary preview、policy save、single-stream check 和 switch history 用例，写入 `apps/api/src/application/output-composition/reorder-channel-streams.use-case.ts`、`apps/api/src/application/output-composition/update-failover-policy.use-case.ts`、`apps/api/src/application/output-composition/check-channel-stream.use-case.ts` 与 `apps/api/src/application/output-composition/evaluate-stream-failover.use-case.ts`
- [X] T117 [US6] 实现 Worker 单线路检查和 failover evaluator，写入 `apps/worker/src/application/health/check-channel-stream.use-case.ts` 与 `apps/worker/src/application/health/evaluate-failover.use-case.ts`，修改 `apps/worker/src/processors/stream-check.processor.ts`
- [X] T118 [P] [US6] 实现 dashboard operations summary 和 actionUrl 查询，写入 `apps/api/src/application/dashboard/get-operations-summary.use-case.ts`
- [X] T119 [P] [US6] 实现来源 readiness/effective priority/output/fallback policy 摘要，写入 `apps/api/src/application/source-management/get-source-effective-policy.use-case.ts`
- [X] T120 [US6] 暴露 stream reorder/policy/check/history 和 operations summary/source policy 契约，修改 `apps/api/src/http/output/output.controller.ts`、`apps/api/src/http/dashboard/dashboard.controller.ts`、`apps/api/src/http/dashboard/dashboard.module.ts` 与 `apps/api/src/http/source/source.controller.ts`
- [X] T121 [P] [US6] 创建线路排序、主备标记、策略配置、删除接替预览和单线路检查 UI，写入 `apps/web/src/features/dashboard/channels/channel-stream-order.tsx` 与 `apps/web/src/features/dashboard/channels/channel-failover-policy.tsx`
- [X] T122 [US6] 将频道详情线路区域接入顺序、policy、per-stream task/loading 和 switch history，修改 `apps/web/src/routes/dashboard/channels/$channelId.tsx` 与 `apps/web/src/features/dashboard/channels/channel-stream-dialog.tsx`
- [X] T123 [P] [US6] 创建运营新鲜度、覆盖率、线路可用率和任务异常卡片及 action links，写入 `apps/web/src/features/dashboard/operations-summary.tsx` 并修改 `apps/web/src/routes/dashboard/index.tsx`
- [X] T124 [US6] 为 M3U/XMLTV 来源表单加入字段关系帮助、higher-priority 说明、readiness 和 effective policy 预览，修改 `apps/web/src/features/dashboard/sources/source-list-page.tsx` 与 `apps/web/src/features/dashboard/epg/source-form-dialog.tsx`

**Checkpoint**: US6 可独立运行 quickstart Scenario 10、13；故障转移确定且可审计，所有异常指标可在三次交互内到达修复入口

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 完成容量、安全、发布、文档和兼容路径收敛

- [X] T125 [P] 在 T003 的 1k/10k 发布夹具基础上补充 50k 容量退化 fixture，并复核三种规模的 seed/verify/reset、全量规范化摘要和人工状态校验，修改 `scripts/validation/safe-operations-fixture.ts`
- [X] T126 [P] 增加 prepare/recovery/apply/audit/outbox 故障注入工具和回放验证，写入 `scripts/validation/safe-operations-failure-injection.ts`
- [X] T127 [P] 增加 backup/audit/task/log 敏感信息扫描和测试秘密断言，写入 `scripts/validation/safe-operations-secret-scan.ts`
- [X] T128 运行 1k/10k/50k 性能与一致性套件并记录 preview/apply/restore、队列等待、锁等待、内存和失败率到 `specs/004-safe-operations-workflow/validation-results.md`
- [X] T129 按 T048 已评审的 rollout runbook 完成 expand/backfill/shadow/enable/contract 各波次回退演练，并把实际命令、结果、证据和偏差追加到 `specs/004-safe-operations-workflow/rollout-runbook.md`
- [ ] T130 在 10k preservation/recovery/shadow 门禁通过后移除旧 delete/recreate 同步匹配路径，修改 `apps/worker/src/processors/m3u-sync.processor.ts`、`apps/worker/src/processors/epg-match.processor.ts`、`apps/api/src/application/channel-catalog/sync-m3u-source.use-case.ts` 与 `apps/api/src/application/output-composition/match-epg.use-case.ts`
- [ ] T131 在兼容观察期完成、T129 回退演练和 T130 门禁通过后，先编写 contract migration 失败测试，再修改 `packages/backend-core/src/database/schema/canonical-channels.ts` 并运行 `pnpm --filter @magi/api db:generate` 生成下一编号 migration；在兼容数据副本运行 `pnpm --filter @magi/api db:migrate`，验证移除 canonical hidden/disabled/outputStatus 与 mergedFromIds 旧真相源且禁止手写 journal，产物写入 `apps/api/drizzle/`
- [X] T132 [P] 更新系统架构、运营协议、备份恢复和故障转移说明，并清理旧 Tailwind/shadcn 技术描述，修改 `docs/architecture.md` 与 `README.md`
- [X] T133 为所有新增/修改 UI 运行 `antd lint apps/web/src --format json`，修复 v6 废弃 API、上下文 Modal、token、键盘可达问题，以及宪法 2.2.0 `design.md` 视觉语言违规：颜色硬编码（`#FFFFFF`/`#FAFAFA` 等）、非 token 字号/字重、4px 网格外的 spacing（magic number 如 11px/13px）、错误的圆角档位（如 button/tag 用 `rounded.full`）、自定义 `cubic-bezier`、同屏多个 primary button、preset 色板误用于主 affordance、绕过 token/algorithm/`theme.components`/CSS variables 的自定义 CSS，结果记录到 `specs/004-safe-operations-workflow/antd-lint-results.json`
- [ ] T134 运行 `specs/004-safe-operations-workflow/quickstart.md` 的 13 个端到端场景；另以至少 20 名首次使用管理员执行 SC-003/005/006 计时可用性验收，记录招募条件、任务脚本、起止规则、逐参与者匿名结果和至少 19/20 通过结论；将证据写入 `specs/004-safe-operations-workflow/usability-validation.md`，并把端到端结果、失败证据和修复链接写入 `specs/004-safe-operations-workflow/validation-results.md`
- [X] T135 运行 `pnpm lint`、`pnpm build`、API/Web/Worker tests 和各包 `tsc --noEmit`，将所有通过结果写入 `specs/004-safe-operations-workflow/validation-results.md`
- [X] T136 对照 FR-001–FR-038 和 SC-001–SC-012 完成最终追踪复核，创建 `specs/004-safe-operations-workflow/requirements-traceability.md` 并更新 `specs/004-safe-operations-workflow/validation-results.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: 无依赖，可立即开始
- **Phase 2 — Foundational**: 依赖 Phase 1；阻塞全部用户故事
- **Phase 3 — US1**: 依赖 Foundation；建议作为第一个可部署 MVP
- **Phase 4 — US2**: 依赖 Foundation；可与 US1 后半段并行，但最终需运行 US1 的自动任务状态保留回归
- **Phase 5 — US3**: 依赖 US1 的 EPG preview/apply 基础
- **Phase 6 — US4**: 依赖 Foundation，可与 US1/US2 并行
- **Phase 7 — US5**: 依赖 US1 的通用 recovery/change-set apply；audit/backup 子任务可在 Foundation 后提前开始
- **Phase 8 — US6**: 故障转移核心依赖 Foundation；完整 Dashboard task integration 依赖 US4
- **Phase 9 — Polish**: 依赖计划纳入本次发布的全部用户故事；rollout 设计已在 T048 完成，T129 只执行演练；T130/T131 还有显式验证和观察期门禁

### User Story Dependency Graph

```text
Setup
  └── Foundation
       ├── US1 Safe Sync/Match ──┬── US3 EPG Workbench
       │                         └── US5 Backup/Audit/Recovery
       ├── US2 Channel Lifecycle
       ├── US4 Tasks/Schedules ───── US6 Dashboard Integration
       └── US6 Failover Core
```

### Within Each User Story

1. 先完成该故事的全部 `Tests` 任务并确认按预期失败
2. 领域模型与 repository ports
3. Infrastructure repositories / Worker use cases
4. Application use cases
5. HTTP contracts
6. Web queries/components/routes
7. 运行独立验收场景并通过 checkpoint

---

## Parallel Opportunities

### Setup and Foundation

- T002–T005 可并行
- T006–T009 可按独立 contract 文件并行
- T011 与 T012 可并行，T013 等待两者
- T015–T018 可按不同 schema 文件并行；T019 等待 schema 汇总并先建立失败测试；T020 只有在 T019 按预期失败后才能 generate/migrate
- T021–T023 可按 domain boundary 并行
- T024 与 T025 可按 repository 文件并行

### Parallel Example: User Story 1

```text
并行测试：T028、T029、T030、T031、T032、T033、T034
并行实现：T035（repositories）、T036（API orchestration）、T040（recovery）、T044（Web queries）
汇合顺序：T037 → T038 → T039 → T041/T042 → T043 → T045/T046/T047
```

### Parallel Example: User Story 2

```text
并行测试：T049、T050、T051、T052、T053
并行实现：T054（domain）与 T058（output tests/adapter）可在不同文件推进
汇合顺序：T055 → T056/T057 → T059/T060/T061
```

### Parallel Example: User Story 3

```text
并行测试：T062、T063、T064、T065
并行实现：T066（matcher）、T067（readiness）、T071（UI components）、T073（manual dialog）
汇合顺序：T068/T069 → T070 → T072/T074
```

### Parallel Example: User Story 4

```text
并行测试：T075–T079
并行实现：T080（task domain）、T081（schedule persistence）、T086（Web queries）、T088（detail UI）
汇合顺序：T082/T083 → T084/T085 → T087/T089/T090
```

### Parallel Example: User Story 5

```text
并行测试：T091–T096
并行实现：T098（audit/outbox）、T099（recovery reads）、T100（serializer）、T104（HTTP skeleton）、T106/T107（Web pages）
汇合顺序：T097/T101/T102 → T103/T105 → T108
```

### Parallel Example: User Story 6

```text
并行测试：T109–T113
并行实现：T114（domain）、T115（repositories）、T118（dashboard query）、T119（source policy）、T121/T123（Web components）
汇合顺序：T116/T117 → T120 → T122/T124
```

---

## Implementation Strategy

### MVP First

1. 完成 Phase 1 Setup
2. 完成 Phase 2 Foundation
3. 完成 Phase 3 US1
4. 停止并运行 quickstart Scenario 1–5、11
5. 仅为一个小来源启用新写入，验证恢复后再扩展

**Suggested MVP scope**: US1 — 安全同步和匹配来源数据。它直接消除当前最严重的数据破坏风险，并建立后续故事共用的 change-set/recovery/task 基础。

### P1 Operational Baseline

MVP 通过后立即完成 US2，使同步/匹配安全与频道生命周期共同形成可投入日常运营的 P1 基线。

### Incremental Delivery

1. Foundation → migrations/backfill/shadow 基础
2. US1 → safe preview/apply/recovery MVP
3. US2 → lifecycle/trash/purge P1 baseline
4. US4 → predictable tasks/schedules
5. US3 → full EPG workbench
6. US5 → backup/audit/recovery operations
7. US6 → dashboard/failover
8. Polish → 10k/50k gates、secret scan、rollout 演练记录、旧路径 contract

每次增量必须独立通过其 checkpoint；不得为了赶后续故事跳过恢复和 preservation 验证。

---

## Notes

- `[P]` 只表示文件和直接依赖允许并行，不代表可以跳过本 Phase 的前置门禁
- 所有 wire types 必须从 `packages/types` 的 Zod schema 推导
- API/Worker 新增日志必须带 requestId、taskId、scopeId，且敏感信息脱敏
- 所有数据库 schema 变更必须通过 `pnpm --filter @magi/api db:generate` 生成迁移，并在空库/兼容数据副本执行 `pnpm --filter @magi/api db:migrate`；禁止手写迁移编号和 Drizzle journal
- Drizzle schema 只在 `packages/backend-core` 定义一次，API/Worker 只能导入或 re-export；Worker application 不得导入 Drizzle、BullMQ 或 Node 文件系统
- 所有 UI 任务执行前必须先读取 T001 产物，完成后执行 T133
- T130 和 T131 是有条件的破坏性收敛任务；验证或观察期未通过时必须保持未完成
- 每完成一个故事或逻辑组应使用 Conventional Commit
