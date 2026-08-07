# Tasks: M3U 控制台

**Input**: Design documents from `/specs/009-m3u-control-plane/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contract](./contracts/m3u-control-plane.md), [quickstart.md](./quickstart.md)

**Tests**: 必须遵循 Red-Green-Refactor。规格包含独立验收场景，且项目宪法要求 API、Worker 和开放接口的契约覆盖；每个用户故事先添加失败测试，再实现。

**Organization**: 任务按用户故事分组；Phase 2 是全部故事的共同阻塞前提。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可与同阶段其他标记任务并行（文件不同且无未完成依赖）。
- **[US#]**：任务所服务的用户故事；仅用户故事阶段标记。

## Phase 1: Setup

**Purpose**: 建立可复用的 M3U 控制台 fixture 与契约工作区。

- [X] T001 [P] Add versioned M3U fixtures for normal, empty, 25%-deletion, same-tvg-id, weak-match, and reappearing-line scenarios in `apps/worker/src/processors/__tests__/fixtures/m3u-control-plane/`
- [X] T002 [P] Add shared API/Worker test builders for change sets, source channels, canonical members, streams, grants, and health observations in `apps/api/src/test/m3u-control-plane-fixtures.ts` and `apps/worker/src/application/__tests__/m3u-control-plane-fixtures.ts`
- [X] T003 Document the feature validation matrix and required local commands in `specs/009-m3u-control-plane/quickstart.md`

---

## Phase 2: Foundational

**Purpose**: Create the shared data, contracts, job semantics, and observability prerequisites. **No user-story implementation begins before this phase completes.**

- [X] T004 [P] Define shared Zod DTOs and enums for M3U change summaries, merge candidates, output grants, publications, health observations, and failover events in `packages/types/src/dto/m3u-control-plane.ts` and `packages/types/src/index.ts`
- [X] T005 [P] Add pure, framework-independent anomaly classification, normalized tvg-id matching, and weak-match candidate helpers with unit tests in `packages/backend-core/src/operation-diff/m3u-control-plane.ts` and `packages/backend-core/src/operation-diff/__tests__/m3u-control-plane.test.ts`
- [X] T006 Extend Drizzle schema exports for source-scoped identity, merge candidates, canonical overrides, health observations, failover events, output grants, and output publications in `packages/backend-core/src/database/schema/channels.ts`, `packages/backend-core/src/database/schema/index.ts`, and new schema files under `packages/backend-core/src/database/schema/`
- [X] T007 Generate and commit the migration for the foundational schema changes in `apps/api/drizzle/` and update `apps/api/drizzle/meta/_journal.json`
- [X] T008 Extend source-sync, output-composition, and task queue domain ports for atomic apply/reconcile input, grants, publications, and health aggregation in `apps/worker/src/domain/source-sync/`, `apps/api/src/domain/output-composition/`, and `apps/api/src/domain/task-execution/task-queue.port.ts`
- [X] T009 Implement database repositories and module wiring for the foundational ports in `apps/worker/src/infrastructure/database/`, `apps/api/src/infrastructure/database/`, `apps/api/src/http/output/output.module.ts`, and `apps/api/src/http/operation/operation.module.ts`
- [X] T010 Define explicit source-scoped prepare/apply/confirm job payloads, idempotency keys, lease heartbeat/release behavior, and structured log context in `apps/api/src/infrastructure/bullmq/task-queue.adapter.ts`, `apps/worker/src/infrastructure/queue/worker-bootstrap.ts`, and `apps/worker/src/application/job-runner.ts`

**Checkpoint**: The system has one typed foundation for atomic M3U changes, composition, output grants, and health evidence; all later stories can rely on it.

---

## Phase 3: User Story 1 — 安全接入并同步 M3U 源 (Priority: P1) 🎯 MVP

**Goal**: 管理者可安全同步 M3U 源，正常变更自动应用，而空目录或 ≥25% 删除保持待确认并保留最后可用目录。

**Independent Test**: 对同一来源依次执行首次导入、正常变更、空目录、25% 删除、失败下载、手动与定时并发触发；验证稳定更新、change set 状态、异常阻止和恢复点。

### Tests for User Story 1

- [X] T011 [P] [US1] Add failing prepare-path tests for immutable snapshots, source-version checks, fingerprint reuse, and 25% anomaly classification in `apps/worker/src/application/operation-safety/__tests__/prepare-m3u-sync.no-side-effect.test.ts`
- [X] T012 [P] [US1] Add failing apply-path integration tests for atomic stable upsert, missing marking, recovery items, and reappearance identity preservation in `apps/worker/src/application/operation-safety/__tests__/apply-m3u-sync.atomic.test.ts`
- [X] T013 [P] [US1] Add failing operation API contract tests for normal auto-apply and explicit confirmation of empty/25%-deletion change sets in `apps/api/src/http/operation/__tests__/m3u-control-plane.contract.test.ts`
- [X] T014 [P] [US1] Add failing scheduler/queue tests proving manual and scheduled triggers enqueue one source-scoped change set without duplicate application in `apps/api/src/application/operation-safety/__tests__/m3u-sync-operation.test.ts` and `apps/worker/src/application/__tests__/safe-operation-jobs.test.ts`

### Implementation for User Story 1

- [X] T015 [US1] Extend `PrepareM3uSyncUseCase` to persist snapshot-to-change-set linkage, current-present baseline, warning codes, source version, and confirmation requirement in `apps/worker/src/application/operation-safety/prepare-m3u-sync.use-case.ts`
- [X] T016 [US1] Make source snapshot staging, fingerprint lookup, and current-present diff queries source-scoped and concurrency-safe in `apps/worker/src/domain/source-sync/source-sync.repository.ts` and `apps/worker/src/infrastructure/database/source-sync.repository.ts`
- [X] T017 [US1] Implement atomic apply with database-native stable upsert, missing marking, source status/fingerprint update, recovery item capture, and real present/missing reconciliation output in `apps/worker/src/application/operation-safety/apply-m3u-sync.use-case.ts` and `apps/worker/src/infrastructure/database/source-sync.repository.ts`
- [X] T018 [US1] Wire prepared snapshot IDs, conditional change-set transitions, worker lease heartbeat/release, automatic normal apply, and explicit anomalous apply confirmation in `apps/api/src/application/operation-safety/prepare-operation-preview.use-case.ts`, `apps/api/src/application/operation-safety/apply-operation.use-case.ts`, and `apps/worker/src/infrastructure/queue/operation-worker.ts`
- [X] T019 [US1] Replace destructive manual and scheduled M3U sync execution with the source-scoped change-set adapter, then remove delete-and-reinsert writes from `apps/worker/src/processors/m3u-sync.processor.ts` and update handler registration in `apps/worker/src/main.ts`
- [X] T020 [US1] Surface source snapshot summary, warning/confirmation state, task progress, last-good result, and retry action in `apps/web/src/features/dashboard/sources/source-list-page.tsx`, `apps/web/src/routes/dashboard/sources/m3u.tsx`, and `apps/web/src/services/api.ts`

**Checkpoint**: M3U sources can be synced without destructive rebuilds; normal updates apply automatically and anomalous changes never modify the directory before confirmation.

---

## Phase 4: User Story 2 — 编排稳定频道与多条线路 (Priority: P1)

**Goal**: 将相同 `tvg-id` 来源条目自动合并为稳定频道，弱信号仅产生候选，且人工编排在同步和 30 天缺失/恢复周期中保持不变。

**Independent Test**: 同步两个相同 `tvg-id` 条目、两个仅名称相似条目及一条会消失并恢复的线路；修改人工字段并重复同步，验证成员关系、线路身份和人工覆盖。

### Tests for User Story 2

- [X] T021 [P] [US2] Add failing reconciliation tests for same-tvg-id-only automatic membership, weak-match candidates, and rejected-candidate suppression in `apps/worker/src/infrastructure/database/__tests__/canonical-reconcile.integration.test.ts`
- [X] T022 [P] [US2] Add failing tests for canonical-level manual field locks, stream ordering, manual streams, and EPG binding preservation in `apps/api/src/application/output-composition/__tests__/output-composition.use-cases.test.ts`
- [X] T023 [P] [US2] Add failing tests for missing-source stream exclusion, 30-day reappearance, and expiry purge in `apps/worker/src/application/operation-safety/__tests__/cleanup-operation-state.test.ts` and `apps/worker/src/processors/__tests__/reconcile-after-sync.test.ts`
- [X] T024 [P] [US2] Add failing contract/UI tests for listing and accepting/rejecting merge candidates in `apps/api/src/http/output/__tests__/merge-candidate.controller.test.ts` and `apps/web/src/features/dashboard/channels/merge-candidates.test.tsx`

### Implementation for User Story 2

- [X] T025 [US2] Replace the legacy weak-name canonical rebuild with authoritative member reconciliation, source-presence transitions, and actual present/missing IDs in `apps/worker/src/application/operation-safety/reconcile-canonical-channels.use-case.ts`, `apps/worker/src/infrastructure/database/canonical-reconcile.repository.ts`, and `apps/worker/src/infrastructure/queue/operation-worker.ts`
- [X] T026 [US2] Implement merge-candidate creation, staleness, acceptance, rejection, and source-fingerprint suppression in `apps/api/src/domain/output-composition/merge-candidate.model.ts`, `apps/api/src/application/output-composition/merge-candidate.use-cases.ts`, and `apps/api/src/infrastructure/database/merge-candidate.repository.ts`
- [X] T027 [US2] Move user-visible composition overrides to canonical scope and preserve legacy source-level override data during migration in `apps/api/src/domain/output-composition/channel-override.model.ts`, `apps/api/src/infrastructure/database/channel-override.repository.ts`, and `apps/api/src/application/output-composition/update-output-channel.use-case.ts`
- [X] T028 [US2] Bind source-derived streams to source channels, exclude missing streams from output, preserve manual streams, and enforce 30-day expiry behavior in `apps/api/src/domain/output-composition/channel-stream.model.ts`, `apps/api/src/infrastructure/database/channel-stream.repository.ts`, and `apps/worker/src/application/operation-safety/cleanup-operation-state.use-case.ts`
- [X] T029 [US2] Expose merge candidate list/review and source-presence details through validated management endpoints in `apps/api/src/http/output/output.controller.ts`, `apps/api/src/http/output/output.module.ts`, and `packages/types/src/dto/m3u-control-plane.ts`
- [X] T030 [US2] Add merge-candidate review UI and show canonical/source/stream provenance plus missing-retention state in `apps/web/src/features/dashboard/channels/merge-candidates.tsx`, `apps/web/src/routes/dashboard/channels/index.tsx`, and `apps/web/src/services/api.ts`
- [X] T031 [US2] Update final-channel and M3U query eligibility so active canonical channels require an active member or manual stream, not a stale source row, in `apps/api/src/application/output-composition/find-canonical-channels.use-case.ts`, `apps/api/src/application/output-composition/generate-m3u-output.use-case.ts`, and `apps/api/src/application/output-composition/generate-v2-output.use-cases.ts`
- [X] T032 [US2] Retire or constrain the old rebuild entry point so it cannot recreate canonical IDs or use weak auto-merge logic in `apps/worker/src/processors/reconcile-canonicals.ts`

**Checkpoint**: Final channels are stable user-owned objects; automatic composition is limited to same `tvg-id`, and missing source lines neither leak into output nor erase recoverable history.

---

## Phase 5: User Story 3 — 理解健康状态与线路选择 (Priority: P2)

**Goal**: 管理者可清晰区分来源健康和线路健康，并让主动探测与真实播放反馈驱动同一套可解释的主备选择。

**Independent Test**: 使用可下载但故障线路的来源，对单条线路探测、上报有效/无效播放结果并触发故障切换；验证健康证据、主线路和输出排序一致。

### Tests for User Story 3

- [ ] T033 [P] [US3] Add failing domain tests for health aggregation, default thresholds, cooldown, recovery, and failover event creation in `apps/api/src/domain/output-composition/__tests__/channel-failover.test.ts`
- [ ] T034 [P] [US3] Add failing worker tests proving a single-stream job targets `streamId` rather than `sourceId` and records active-probe observations in `apps/worker/src/processors/__tests__/stream-check.failover.test.ts`
- [ ] T035 [P] [US3] Add failing playback-report tests for channel/stream ownership validation, 10-second device deduplication, and safe ignore behavior in `apps/api/src/http/open/__tests__/playback-report.contract.test.ts`
- [ ] T036 [P] [US3] Add failing output ordering tests showing M3U and Open playback use the same health/primary/position decision in `apps/api/src/application/output-composition/__tests__/v2-output-guide.use-cases.test.ts` and `apps/api/src/http/open/__tests__/open-playback.test.ts`

### Implementation for User Story 3

- [ ] T037 [US3] Implement immutable active-probe and playback-report evidence repositories plus failover-history persistence in `apps/api/src/domain/output-composition/stream-health.model.ts`, `apps/api/src/infrastructure/database/stream-health-observation.repository.ts`, and `apps/api/src/infrastructure/database/failover-event.repository.ts`
- [ ] T038 [US3] Extract one health aggregation and failover orchestration use case that atomically updates streams, canonical primary ID, policy state, and history in `apps/api/src/application/output-composition/aggregate-stream-health.use-case.ts` and `apps/api/src/application/output-composition/channel-failover.use-cases.ts`
- [ ] T039 [US3] Update Worker probing to emit observations, use explicit `streamId`/`sourceId` scopes, and invoke the shared orchestration action in `apps/worker/src/processors/stream-check.processor.ts`, `apps/api/src/application/task-execution/enqueue-sync.use-case.ts`, and `apps/api/src/http/output/output.controller.ts`
- [ ] T040 [US3] Validate playback-report channel/stream ownership, preserve safe idempotent responses, and invoke shared orchestration in `apps/api/src/application/open/report-playback.use-case.ts` and `apps/api/src/http/open/open.controller.ts`
- [ ] T041 [US3] Make Open playback and both M3U generators consume the shared line-selection ordering in `apps/api/src/application/open/resolve-playback.use-case.ts`, `apps/api/src/application/output-composition/generate-m3u-output.use-case.ts`, and `apps/api/src/application/output-composition/generate-v2-output.use-cases.ts`
- [ ] T042 [US3] Display separate source/line health, latest evidence, switch reason, and recovery state in `apps/web/src/features/dashboard/sources/source-list-page.tsx`, `apps/web/src/features/dashboard/channels/channel-failover-policy.tsx`, and `apps/web/src/routes/dashboard/channels/$channelId.tsx`

**Checkpoint**: A source can be download-healthy while a line is playback-unhealthy; all consumers see one explainable, consistent decision.

---

## Phase 6: User Story 4 — 安全分发最终输出 (Priority: P2)

**Goal**: 管理者可按播放器/设备签发、轮换和撤销稳定 M3U 输出资格，并读取当前输出发布状态。

**Independent Test**: 签发两个 grant，用第一个读取动态 M3U、撤销它并验证第二个仍可用；确认输出 publication 反映正常、stale 和 blocked 情况。

### Tests for User Story 4

- [ ] T043 [P] [US4] Add failing grant lifecycle and plaintext-once tests in `apps/api/src/application/output-composition/__tests__/output-grant.use-cases.test.ts`
- [ ] T044 [P] [US4] Add failing public playlist contract tests for valid, revoked, expired, and malformed grants plus query-token redaction in `apps/api/src/http/open/__tests__/playlist-grant.contract.test.ts`
- [ ] T045 [P] [US4] Add failing publication projection tests for fresh, stale, blocked, counts, and revision changes in `apps/api/src/application/output-composition/__tests__/output-publication.use-cases.test.ts`
- [ ] T046 [P] [US4] Add failing management UI tests for one-time reveal, rotation confirmation, revocation isolation, and publication status in `apps/web/src/routes/dashboard/output-addresses.test.tsx`

### Implementation for User Story 4

- [ ] T047 [US4] Implement output-grant domain rules, secure token generation/hash/rotation, ownership checks, and repository persistence in `apps/api/src/domain/output-composition/output-grant.model.ts`, `apps/api/src/application/output-composition/output-grant.use-cases.ts`, and `apps/api/src/infrastructure/database/output-grant.repository.ts`
- [ ] T048 [US4] Implement output-publication projection updates, revision calculation, stale/blocked semantics, and repository queries in `apps/api/src/domain/output-composition/output-publication.model.ts`, `apps/api/src/application/output-composition/output-publication.use-case.ts`, and `apps/api/src/infrastructure/database/output-publication.repository.ts`
- [ ] T049 [US4] Add owner-scoped grant create/list/rotate/revoke and publication-status management endpoints in `apps/api/src/http/output/output.controller.ts`, `apps/api/src/http/output/output.module.ts`, and `packages/types/src/dto/m3u-control-plane.ts`
- [ ] T050 [US4] Add the grant-protected dynamic V2 playlist endpoint, authentication guard, caching headers, and secret redaction to `apps/api/src/http/open/playlist.controller.ts`, `apps/api/src/shared/guards/output-grant.guard.ts`, and `apps/api/src/http/open/open.module.ts`
- [ ] T051 [US4] Update V2 M3U generation to honor grant profile, current publication revision, hidden/disabled/unplayable exclusion, and shared line ordering in `apps/api/src/application/output-composition/generate-v2-output.use-cases.ts`
- [ ] T052 [US4] Add output grant and publication management UI using queried Ant Design v6 APIs in `apps/web/src/routes/dashboard/output-addresses.tsx`, `apps/web/src/features/dashboard/output/output-grant-dialog.tsx`, and `apps/web/src/services/api.ts`
- [ ] T053 [US4] Regenerate and verify the public API contract and compatibility tests in `apps/api/src/main.ts`, `apps/api/src/http/open/__tests__/playlist-grant.contract.test.ts`, and `apps/web/src/services/openapi-types.ts`

**Checkpoint**: Every traditional player has independently revocable output access, while management sees whether the dynamically generated directory is fresh, stale, or blocked.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify migration safety, security, observability, user-facing consistency, and end-to-end quality across all stories.

- [ ] T054 [P] Add migration and backward-compatibility tests for existing sources, canonical channels, overrides, streams, and API clients in `apps/api/src/infrastructure/database/__tests__/m3u-control-plane-migration.test.ts`
- [ ] T055 [P] Add audit/log redaction coverage for source headers, grants, playlist URLs, and playback URLs in `apps/api/src/shared/__tests__/m3u-control-plane-redaction.test.ts`
- [ ] T056 [P] Update source/output management route navigation, loading, empty, failed, and stale states in `apps/web/src/router.tsx`, `apps/web/src/features/dashboard/sources/source-list-page.tsx`, and `apps/web/src/routes/dashboard/output-addresses.tsx`
- [ ] T057 Add request/task/change-set correlation logging and operational dashboards for prepare, apply, recovery, purge, grant, and failover lifecycles in `apps/api/src/shared/http/request-context.middleware.ts`, `apps/worker/src/application/job-runner.ts`, and `apps/api/src/application/dashboard/get-operations-summary.use-case.ts`
- [ ] T058 Run `antd info`, `antd demo`, `antd semantic`, `antd token`, and `antd lint` for every new/changed management UI file, recording follow-up fixes in `apps/web/src/features/dashboard/` and `apps/web/src/routes/dashboard/`
- [ ] T059 Update the M3U product and architecture documentation to match the unified control-plane workflow in `README.md`, `docs/architecture.md`, and `docs/magi-tv-product-roadmap.md`
- [ ] T060 Execute all quickstart scenarios and record outcomes, including 10,000-channel progress and concurrent-source behavior, in `specs/009-m3u-control-plane/quickstart.md`
- [ ] T061 Run final quality gates and resolve failures with `pnpm lint`, `pnpm build`, `pnpm --filter @magi/api test`, `pnpm --filter @magi/worker test`, and `pnpm --filter @magi/web test`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 → Phase 2**: Fixtures and test builders establish shared language for schema and integration work.
- **Phase 2 → US1–US4**: Foundational schema, domain ports and queue semantics are blocking.
- **US1 → US2**: Stable, atomic source channels and real reconcile input are required before durable composition.
- **US2 → US3**: Health and failover operate on canonical members and stable source/manual streams.
- **US2 → US4**: Output grants can be built after canonical output eligibility exists; final shared line ordering integration follows US3.
- **US3 + US4 → Polish**: Cross-cutting validation needs final output, health and access behavior.

### User Story Dependencies

- **US1 (P1)**: First MVP; it delivers safe source synchronization and anomaly protection.
- **US2 (P1)**: Depends on US1; it delivers stable multi-source channel composition.
- **US3 (P2)**: Depends on US2; it delivers explainable source/line health and unified failover.
- **US4 (P2)**: Can begin grant/publication work after US2; complete it after US3 to consume final line selection.

### Parallel Opportunities

- T001–T002, T004–T006, and test tasks marked `[P]` can run concurrently within their phase.
- After Phase 2, US1 test tasks can run together; after US1, US2 test tasks can run together.
- After US2, US3 and the schema/domain portion of US4 may proceed in parallel; T051–T053 wait for US3’s shared selection contract.
- Polish tasks T054–T056 can run in parallel before the final integrated quality gates.

## Parallel Example: User Story 2

```text
Task: "T021 canonical reconciliation coverage in apps/worker/src/infrastructure/database/__tests__/canonical-reconcile.integration.test.ts"
Task: "T022 override preservation coverage in apps/api/src/application/output-composition/__tests__/output-composition.use-cases.test.ts"
Task: "T023 missing-retention coverage in apps/worker/src/application/operation-safety/__tests__/cleanup-operation-state.test.ts"
Task: "T024 candidate contract/UI coverage in apps/api/src/http/output/__tests__/merge-candidate.controller.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phases 1 and 2.
2. Complete US1 through T020.
3. Validate normal, empty and ≥25% deletion M3U updates independently.
4. Demonstrate safe, stable source synchronization before expanding channel composition.

### Incremental Delivery

1. US1 — Safe source synchronization and last-good protection.
2. US2 — Stable channel composition, candidate review and missing-line lifecycle.
3. US3 — Unified health evidence and failover.
4. US4 — Per-device/player output grants and publication status.
5. Phase 7 — Migration, security, observability and full quickstart validation.

## Notes

- All checklist tasks use the required checkbox, sequential ID, optional `[P]` marker, story label for story work, and exact path format.
- Do not implement a parallel delete-and-rebuild path; the snapshot/change-set path is the only allowed M3U write authority.
- API, Worker and Web changes require compatible shared DTO updates; public contract changes must regenerate `/api/open.json` before Android TV compatibility validation.
