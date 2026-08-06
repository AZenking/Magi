# Tasks: 数据管线可靠性与播放反馈闭环

**Input**: Design documents from `/specs/008-pipeline-reliability/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: 本特性遵循宪法规定的 Red-Green-Refactor。每个用户故事先完成测试任务，确认测试在实现前按预期失败，再开始实现任务。

**Organization**: 任务按用户故事组织，使每个故事都能独立验收。共享契约、Drizzle adapter、纯函数下沉放入阻塞基础阶段。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可在不同文件中并行执行，且不依赖未完成任务
- **[Story]**: 对应 `spec.md` 中的用户故事
- 每个任务都包含明确文件路径

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 提取共享代码、清理死代码、准备跨故事复用的纯函数和契约。

- [X] T001 [P] 将 `ChannelFailoverPolicyModel.decideTarget` 的纯决策逻辑提取为独立纯函数 `decideFailoverTarget(primary, backups, policy)`，写入 `packages/backend-core/src/processors/failover-policy.ts`，并让 `apps/api/src/domain/output-composition/channel-failover-policy.model.ts` 的 `decideTarget` 委托给它，保持行为不变
- [X] T002 [P] 删除 API 端死代码双胞胎 `apps/api/src/application/channel-catalog/sync-m3u-source.use-case.ts` 和 `apps/api/src/application/channel-catalog/sync-xmltv-source.use-case.ts`，移除对应的 module 注册和 import（grep 确认零运行时调用方后再删）
- [X] T003 [P] 为 playback report 新增 Zod schema `PlaybackReportRequestSchema` 及推导类型，写入 `packages/types/src/dto/playback-report.ts`，并在 `packages/types/src/dto/index.ts` 导出
- [X] T004 [P] 新增数据库迁移，给 `channel_streams` 表添加 `last_playback_report_at` 列（timestamp tz, nullable），运行 `pnpm --filter @magi/api db:generate` 审阅 SQL 后 `db:migrate`，产物写入 `apps/api/drizzle/`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 实现 Worker 端缺失的 Drizzle adapter，为 US1（reconcile）和 US2（safe-op）提供基础设施。

**⚠️ CRITICAL**: US1 和 US2 依赖此阶段完成

- [X] T005 [P] 实现 `ICanonicalReconcileRepository` 的 Drizzle adapter，写入 `apps/worker/src/infrastructure/database/canonical-reconcile.repository.ts`，方法：`findMembership(sourceChannelIdentity)` / `upsertMembership` / `createCanonicalFromSource(identity, displayName)` / `deactivateMembership`，使用 `channelIdentity`（非 UUID）为 membership key
- [X] T006 [P] 实现 `ISourceSyncRepository` 的 Drizzle adapter，写入 `apps/worker/src/infrastructure/database/source-sync.repository.ts`，方法：`stageSnapshot` / `computeChangeItems` / `stableUpsert` / `markMissing` / `recordSourceSync`（对应 PrepareM3uSync / ApplyM3uSync 的端口）
- [X] T007 [P] 实现 `IEpgSyncRepository` 的 Drizzle adapter，写入 `apps/worker/src/infrastructure/database/epg-sync.repository.ts`，方法：`isXmltvReady` / `loadCandidates` / `applyEpgBinding`（对应 PrepareEpgMatch / ApplyEpgMatch 的端口）
- [X] T008 [P] 实现 `IRestorePort` 的 Drizzle adapter，写入 `apps/worker/src/infrastructure/database/restore.repository.ts`，方法：`restoreObject(item)`（按 recovery_point_items 的 itemOrder 恢复）
- [X] T009 [P] 实现 `ICleanupPort` 的 Drizzle adapter，写入 `apps/worker/src/infrastructure/database/cleanup.repository.ts`，方法：`expireTerminalChangeSets` / `expireSnapshots` / `expireIdempotencyRecords` / `reclaimExpiredLeases`（24h retention）

**Checkpoint**: Worker 端基础设施就绪，US1 和 US2 的 use case 可以被激活。

---

## Phase 3: User Story 1 - 同步后自动看到输出频道 (Priority: P1) 🎯 MVP

**Goal**: 修复定时同步遍历逻辑，并在 M3U 同步后自动生成/更新 canonical_channels，无需手动触发 EPG 匹配。

**Independent Test**: 创建 M3U 源并同步；验证输出频道列表在同步完成后已有频道（即使尚未执行 EPG 匹配）。再验证定时同步能遍历所有源。

### Tests for User Story 1

- [X] T010 [P] [US1] 写失败测试：定时同步 job 收到 `sourceId=null` 时遍历所有 enabled 源并为每个投递子 job，验证不抛 "Source not found"，写入 `apps/worker/src/processors/__tests__/m3u-sync.fanout.test.ts`
- [X] T011 [P] [US1] 写失败测试：M3U 同步完成后调用 reconcile 使 `canonical_channels` 和 `channel_streams` 生成，验证同步后输出非空，写入 `apps/worker/src/processors/__tests__/reconcile-after-sync.test.ts`
- [X] T012 [P] [US1] 写失败测试：连续 2 次同步后人工配置（displayName override）不丢失，写入 `apps/worker/src/infrastructure/database/__tests__/canonical-reconcile.integration.test.ts`

### Implementation for User Story 1

- [X] T013 [US1] 在 `apps/worker/src/processors/m3u-sync.processor.ts` 开头增加 null sourceId 检测分支：当 `sourceId` 为 null 时查询所有 `enabled` 的 m3u 源，为每个源投递独立 `m3u-sync` 子 job（带真实 sourceId），返回批量结果 `SyncBatchResult`
- [X] T014 [US1] 在 `apps/worker/src/processors/xmltv-sync.processor.ts` 开头增加同样的 null sourceId 遍历逻辑（为每个 enabled xmltv 源投递子 job）
- [X] T015 [US1] 从 `apps/worker/src/processors/epg-match.processor.ts` 的 L73-482 提取 canonical 重建逻辑为独立函数 `reconcileCanonicals()`，写入 `apps/worker/src/processors/reconcile-canonicals.ts`，接受 channels + overrides + existing canonical 为参数，返回 reconcile 结果
- [X] T016 [US1] 修改 `reconcileCanonicals()` 使用 `channel.channelIdentity`（稳定串）替代 `channel.id`（UUID）作为 canonical↔source 的 membership key，移除 epg-match.processor 中 L92-107 的 overrideByIdentity UUID 反查兜底
- [X] T017 [US1] 在 `apps/worker/src/processors/m3u-sync.processor.ts` 末尾（channels 写入后、updateSyncStatus 前）调用 `reconcileCanonicals()`，使 M3U 同步完成后自动生成/更新 canonical_channels + channel_streams + catalog_revision bump
- [X] T018 [US1] 修改 `apps/worker/src/processors/epg-match.processor.ts`，移除 canonical 重建逻辑（改为调用 `reconcileCanonicals()` 仅在有 EPG 变化时），保留 EPG 绑定逻辑（L17-69），不再 bump `catalog_revision`（只 bump `epg_revision`）
- [X] T019 [US1] 在 `apps/api/src/infrastructure/bullmq/scheduler.ts` 增加 XMLTV 定时同步：投递 `xmltv-sync` job（sourceId=null），并在 `task-queue.adapter.ts` 的 `JOB_REGISTRY` 添加 `scheduled-xmltv-sync` 条目

**Checkpoint**: User Story 1 独立可验收——M3U 同步后输出频道立即可见，定时同步遍历所有源，人工配置不丢失。

---

## Phase 4: User Story 2 - 安全操作预览与回滚生效 (Priority: P2)

**Goal**: 移除 main.ts 的 inline shadowing handler，激活 7 个 safe-op worker use case，使预览无副作用、应用有变更集且可回滚。

**Independent Test**: 发起一次源同步的安全操作；验证预览阶段不改变任何输出数据，预览变更数与应用后一致，且可通过恢复点回滚。

### Tests for User Story 2

- [X] T020 [P] [US2] 写失败测试：安全操作预览阶段对输出频道数据的变更数为 0（预览前后 `canonical_channels` 行数和内容不变），写入 `apps/worker/src/application/operation-safety/__tests__/prepare-m3u-sync.no-side-effect.test.ts`
- [X] T021 [P] [US2] 写失败测试：安全操作应用阶段原子执行变更集，失败时完整回滚，写入 `apps/worker/src/application/operation-safety/__tests__/apply-m3u-sync.atomic.test.ts`
- [X] T022 [P] [US2] 写失败测试：安全操作应用创建恢复点，可通过恢复点回滚到操作前状态，写入 `apps/worker/src/application/operation-safety/__tests__/apply-recovery-restore.test.ts`

### Implementation for User Story 2

- [X] T023 [US2] 删除 `apps/worker/src/main.ts` L72-118 的 inline `operation-prepare` / `operation-apply` handler，改为调用 `registerOperationHandlers(runner)`（来自 `operation-worker.ts`），使其不再被 `worker-bootstrap.ts` 的 `has()` 检查短路
- [X] T024 [US2] 重写 `apps/worker/src/infrastructure/queue/operation-worker.ts` 的 `registerOperationHandlers`，注入 Phase 2 的 5 个 Drizzle adapter 并实例化 7 个 use case（PrepareM3uSync / ApplyM3uSync / PrepareEpgMatch / ApplyEpgMatch / ReconcileCanonical / ApplyRecoveryRestore / CleanupOperationState），替换 4 个 stub 为真实 use case 调用
- [X] T025 [US2] 实现 `operation-prepare` handler：按 `job.payload.kind` 调用 `PrepareM3uSyncUseCase` 或 `PrepareEpgMatchUseCase`，将结果（snapshotId + summary）写回 `operation_change_sets`（status=ready），不产生数据副作用
- [X] T026 [US2] 实现 `operation-apply` handler：读 `job.payload.changeSetId` + `recoveryPointId`，调用 `ApplyM3uSyncUseCase`（或 ApplyEpgMatch），然后调 `ReconcileCanonicalChannelsUseCase`，写 recovery point items（真实 count + checksum），最后 status=applied
- [X] T027 [US2] 实现 `operation-restore` handler：读 `job.payload.recoveryPointId`，调用 `ApplyRecoveryRestoreUseCase`，按 itemOrder 恢复每个对象
- [X] T028 [US2] 在 `apps/worker/src/main.ts` 的 `QUEUE_CONFIG` 添加 `operation-restore` 和 `operation-cleanup` kind 到 source-sync 队列，并在 `bootstrap()` 调用 `startOperationCleanupWorker()`（来自 `operation-cleanup-worker.ts`）
- [X] T029 [US2] 实现 `operation-cleanup` handler：调用 `CleanupOperationStateUseCase`，执行 24h 过期的 change_sets / snapshots / idempotency_records / leases 清理

**Checkpoint**: User Story 2 独立可验收——预览无副作用，应用有变更集，可回滚。

---

## Phase 5: User Story 3 - 播放结果回馈与健康线路切换 (Priority: P2)

**Goal**: 新增 TV 播放失败上报接口，将 EvaluateStreamFailoverUseCase 接入 stream-check 和 playback-report 处理流程。

**Independent Test**: TV 播放主线路失败后切换备线路并上报；服务端更新健康度；主线路连续失败超阈值后自动切换主备标记。

### Tests for User Story 3

- [X] T030 [P] [US3] 写失败测试：`POST /api/open/v1/playback/report` 的 OpenAPI/controller 契约测试，覆盖 device principal 要求、outcome/errorKind 校验、streamId 不存在时安全忽略、重复去重，写入 `apps/api/src/http/open/__tests__/playback-report.contract.test.ts`
- [X] T031 [P] [US3] 写失败测试：playback report 更新 `channel_streams.consecutiveFailures` 和 `healthStatus`（failure +1 / success 归零），写入 `apps/api/src/application/open/__tests__/report-playback.use-case.test.ts`
- [X] T032 [P] [US3] 写失败测试：stream-check 后自动调用 failover evaluate，主线路 consecutiveFailures >= 3 时切换 isPrimary，写入 `apps/worker/src/processors/__tests__/stream-check.failover.test.ts`
- [X] T033 [P] [US3] 写 TV 失败测试：`reportPlayback` DTO 映射 + `ClientSessionRepository.reportPlayback` 端口方法，写入 `apps/tv/app/src/test/kotlin/com/magi/tv/data/repository/PlaybackReportTest.kt`

### Implementation for User Story 3 — API 端

- [X] T034 [US3] 实现 `ReportPlaybackUseCase`，写入 `apps/api/src/application/open/report-playback.use-case.ts`，注入 `CHANNEL_STREAM_REPOSITORY`，按 streamId 定位线路，更新 `consecutiveFailures`（failure +1 / success 归零）、`healthStatus`（>=3 offline / >=1 degraded / 0 online）、`lastPlaybackReportAt`，对同设备同线路 10s 窗口的重复 failure 去重
- [X] T035 [US3] 在 `apps/api/src/http/open/open.controller.ts` 新增 `@Post("playback/report")` 路由，要求 `principal.kind === "device"`，用 `PlaybackReportRequestSchema` 校验 body，调用 `ReportPlaybackUseCase`，返回 `{ success: true, data: { accepted: true } }`
- [X] T036 [US3] 在 `apps/api/src/http/open/open.module.ts` 注册 `ReportPlaybackUseCase` 为 provider

### Implementation for User Story 3 — Worker 端（自动换线）

- [X] T037 [US3] 在 `apps/worker/src/processors/stream-check.processor.ts` 的 `recomputeCanonicalStatus()` 之后，遍历健康度发生变化的 `canonicalChannelId`，对每个调用下沉的 `decideFailoverTarget` 纯函数（来自 Phase 1 T001），若 target !== 当前 primary 则执行 isPrimary 切换（新 primary true + 旧 primary false）+ 更新 `canonical_channels.primaryStreamId` + 审计记录
- [X] T038 [US3] 在 `apps/api/src/application/open/report-playback.use-case.ts` 中，更新线路健康度后对受影响的 `canonicalChannelId` 调用 `EvaluateStreamFailoverUseCase.evaluate()`（API 端可直接注入），若返回 target !== primary 则执行同样的 isPrimary 切换

### Implementation for User Story 3 — TV 端

- [X] T039 [P] [US3] 在 `apps/tv/app/src/main/kotlin/com/magi/tv/domain/repository/ClientSessionRepository.kt` 新增 `suspend fun reportPlayback(report: PlaybackReport)` 端口方法
- [X] T040 [US3] 在 `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/ClientDtos.kt` 新增 `PlaybackReportRequestDto`，在 `ClientApi.kt` 新增 `@POST("api/open/v1/playback/report")` 方法
- [X] T041 [US3] 在 `apps/tv/app/src/main/kotlin/com/magi/tv/data/repository/DefaultClientSessionRepository.kt` 实现 `reportPlayback`：映射 domain `PlaybackReport` → `PlaybackReportRequestDto`，调 `ClientApi.reportPlayback`，网络失败时放入内存暂存队列（上限 20 条），在心跳成功或网络恢复时批量重传
- [X] T042 [US3] 在 `apps/tv/app/src/main/kotlin/com/magi/tv/playback/Media3PlaybackSession.kt` 的 `handleLineError`（L231-254）中，在现有 `diagnosticsRepository.recordEvent` 之后调用 `reportPlayback`（带 channelId、streamId、errorKind），在首次成功播放（STATE_READY + recordFirstFrame）时上报 `outcome=success` + `playedDurationMs` 首帧耗时
- [X] T043 [US3] 在 `apps/tv/app/src/main/kotlin/com/magi/tv/platform/client/ClientHeartbeatCoordinator.kt` 的心跳成功回调中，检查并重传 `DefaultClientSessionRepository` 中暂存的 playback report 队列

**Checkpoint**: User Story 3 独立可验收——播放失败上报、健康度更新、自动主备切换闭环。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的质量、安全和文档收尾。

- [X] T044 [P] 在 `apps/api/src/main.ts` 确认 Swagger 自动生成的 `/api/open.json` 包含 `POST /api/open/v1/playback/report`，验证无 hand-edit
- [X] T045 [P] 更新 `docs/architecture.md`，记录 canonical 生成解耦（m3u-sync 后自动 reconcile）、safe-op worker 激活、playback report + failover 闭环
- [X] T046 运行 `specs/008-pipeline-reliability/quickstart.md` 的全部验收场景：US1（同步后见频道 + 定时遍历 + 人工配置保留）、US2（预览无副作用 + 应用 + 回滚）、US3（播放上报 + 去重 + 自动切换 + 并发），结果写入 `specs/008-pipeline-reliability/validation-results.md`
- [X] T047 运行仓库质量门禁 `pnpm lint && pnpm build && pnpm --filter @magi/api test && pnpm --filter @magi/web test && cd apps/tv && ./gradlew :app:lintDebug :app:testDebugUnitTest :app:assembleDebug`，解决全部失败

### Android TV Quality Tasks

- [X] T048 [P] 验证 playback report 不影响播放器单一所有者、换线序列和焦点恢复（`Media3PlaybackSession` 无行为退化）
- [X] T049 [P] 验证 playback report 暂存/重传在断网恢复后正常工作（MockWebServer 模拟）
- [X] T050 记录 Android TV 模拟器验收结果：播放失败上报、换线、断网恢复后重传，写入 `specs/008-pipeline-reliability/quickstart.md` §4

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001–T004 可立即并行开始。
- **Phase 2 (Foundational)**: T005–T009 依赖 Phase 1（T005 依赖 T001 的 identity key 设计）；阻塞 US1 和 US2。
- **US1 (Phase 3)**: 依赖 Phase 1；推荐 MVP。
- **US2 (Phase 4)**: 依赖 Phase 2（5 个 Drizzle adapter）+ US1（reconcile 函数已提取）。
- **US3 (Phase 5)**: 依赖 Phase 1 T001（failover 纯函数下沉）+ T003（Zod schema）+ T004（migration）；与 US1/US2 无强依赖，可并行。
- **Phase 6 (Polish)**: 依赖全部目标故事完成。

### User Story Dependencies

```text
Phase 1 → Phase 2 (Foundational)
             │
Phase 1 ─────┼── US1 (sync + reconcile) ──┐
             │                             ├── Polish
             ├── US2 (safe-op worker) ─────┤
             │   (needs Phase 2 + US1's    │
             │    reconcile extract)       │
             │                             │
             └── US3 (playback + failover) ┘
                 (needs T001 + T003 + T004)
```

- **US1 (P1)**: 无故事依赖（仅需 Phase 1）；推荐 MVP。
- **US2 (P2)**: 依赖 Phase 2 + US1 的 `reconcileCanonicals` 提取（T015）。
- **US3 (P2)**: 依赖 Phase 1 的 T001/T003/T004；与 US1/US2 独立。

### Within Each User Story

- 先写标记的测试任务，确认失败。
- 纯函数/domain 改动在 use case/processor 之前。
- Worker processor 改动在 API controller 之前（US3 中 API 和 Worker 可并行）。
- 故事 checkpoint 验收后再开始下一个。

### Parallel Opportunities

- Phase 1: T001/T002/T003/T004 全部可并行。
- Phase 2: T005/T006/T007/T008/T009 全部可并行（不同 adapter 文件）。
- US1: T010/T011/T012 测试可并行；T013/T014 可并行（不同 processor）。
- US3: API 端 T034/T035/T036 与 TV 端 T039/T040 可并行（不同语言/文件）。

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 Setup（T001–T004）。
2. 完成 US1（T010–T019）。
3. **STOP and VALIDATE**: 验证 M3U 同步后输出频道立即可见，定时同步遍历所有源。
4. 这是最高价值增量——解决"同步了但看不到频道"的核心体验断裂。

### Incremental Delivery

1. Phase 1 + US1 → 核心管线自动跑通（MVP）。
2. Phase 2 + US2 → 安全操作预览/回滚生效。
3. US3（可与 US2 并行）→ 播放反馈闭环 + 自动换线。
4. Phase 6 → 全量验收 + 文档。

### Parallel Team Strategy

- 开发者 A: US1（管线解耦）。
- 开发者 B: Phase 2 + US2（safe-op 激活），等 US1 的 reconcile 提取完成后接上。
- 开发者 C: US3（playback + failover），Phase 1 完成后即可独立推进。

---

## Notes

- [P] 任务 = 不同文件，无依赖。
- [Story] 标签映射到 spec.md 的用户故事。
- 每个故事可独立完成和验收。
- 验证测试在实现前失败。
- 每个 task 或逻辑组完成后 commit。
- 在任一 checkpoint 可停止并独立验收故事。
