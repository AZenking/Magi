# Implementation Plan: 数据管线可靠性与播放反馈闭环

**Branch**: `008-pipeline-reliability` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-pipeline-reliability/spec.md`

## Summary

修复数据管线中 5 个断裂点，使"添加数据源 → 输出频道 → TV 稳定播放 → 服务端优化线路"
的端到端流程自动跑通。三个方向：
1. **US1（P1）**：定时同步遍历所有源（修复 null sourceId）；M3U 同步后自动 reconcile
   canonical（从 epg-match.processor 中解耦），不再强制手动跑 EPG 匹配才有输出频道。
2. **US2（P2）**：激活 7 个已实现的 Safe Operations worker use case（需补 5 个 Drizzle
   adapter），替换 main.ts 中的 inline shadowing handler，使预览无副作用、应用有变更集
   且可回滚。
3. **US3（P2）**：新增 TV 播放失败上报接口（`POST /playback/report`），将
   `EvaluateStreamFailoverUseCase` 接入 stream-check 和 playback-report 处理流程，打通
   "主动探测 + 被动上报 → 自动主备切换"闭环。

## Technical Context

**Language/Version**: TypeScript 5.8（Node.js ≥20）；Kotlin 2.0.21 / JVM 17

**Primary Dependencies**: NestJS 11、Drizzle ORM 0.45、BullMQ、Zod（`@magi/types`）、
TanStack Query、antd 6、Retrofit 2.11、OkHttp 4.12、kotlinx.serialization 1.7、
Media3/ExoPlayer

**Storage**: PostgreSQL（channels、canonical_channels、channel_streams、operation_change_sets、
recovery_points、sync_logs）；Redis（BullMQ 队列）

**Testing**: Vitest（domain/application/repository/controller/worker）、JUnit 4 + kotlin-test
+ coroutines-test + MockWebServer（TV）；PostgreSQL 集成与并发测试

**Target Platform**: Linux API/Worker 服务、现代桌面浏览器（Web 管理端）、Android TV 9+（TV）

**Project Type**: Monorepo Web + modular monolith API + Worker + Android TV 客户端

**Performance Goals**:
- 定时同步中每个源的 M3U/XMLTV 下载+解析+写库与手动单源同步耗时一致（无额外开销）。
- canonical reconcile 在单源变更后增量处理，不全表重算。
- playback report 接口 P95 < 100ms（轻量写操作，仅更新 channel_streams 几列）。
- stream-check 后自动换线决策在每个受影响频道 < 50ms。

**Constraints**:
- Worker processor 是纯函数（非 NestJS），不能直接 `@Inject` API 端 use case；需通过
  构造注入或纯函数下沉到 backend-core 解决 DI 障碍。
- canonical 解耦不得改变现有合并算法（computeMergeKey / survivor 选择 / override 合并）
  的输出结果——只改变触发时机（从 epg-match 内联 → m3u-sync 后独立步骤）。
- playback report 必须与现有 stream-check 健康度语义一致（consecutiveFailures 阈值 = 3
  → offline，否则 degraded），两种信号合并不产生矛盾。
- Safe Operations 激活后，legacy 定时同步路径必须继续工作（兼容期），直到 safe-op 被确
  认稳定。

**Scale/Scope**: 定时同步覆盖全部已启用源（通常 5-20 个 M3U + 2-5 个 XMLTV）；每源频道
数 500-50,000；playback report 峰值 ~17 req/s（1,000 在线 TV × 60s 间隔心跳级别的换线
上报频率上限）。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle / Gate | Result | Design Evidence |
| --- | --- | --- |
| I. Clean Architecture | PASS | Worker processor 保持纯函数；Safe-op use case 依赖 domain ports（已满足），新增 Drizzle adapter 放 infrastructure；playback report use case 在 application 层编排，controller 只校验+塑形。`decideTarget` 纯逻辑下沉 backend-core 不违反依赖方向。 |
| II. Monorepo / Shared Packages | PASS | playback report 的 Zod schema 在 `packages/types`；TV DTO 由 OpenAPI 契约对齐；`decideTarget` 纯函数放 `packages/backend-core` 供 API + Worker 共享。 |
| III. Domain Independence | PASS | 新增 domain port（`ICanonicalReconcileRepository` 已定义、`IPlaybackReportRepository` 新增）；不导入框架。 |
| IV. Heavy Work Async | PASS | 定时同步、canonical reconcile、safe-op apply 均在 Worker BullMQ job 中执行。playback report 是轻量同步写（<100ms），不入队。 |
| V. Contract & Type Safety | PASS | playback report Zod schema 单一真相源；OpenAPI 更新 + TV 契约测试验证。`taskType` 映射修复需同步 API→Worker 两端。 |
| VI. Maintainability / YAGNI | PASS | 复用已实现的 7 个 safe-op use case + `EvaluateStreamFailoverUseCase`（不重写）；删除死代码双胞胎（API SyncM3uSourceUseCase / SyncXmltvSourceUseCase）；不做 Redis presence 或推送（YAGNI）。 |
| VII. Observability | PASS | 所有新增流程（reconcile、safe-op apply、playback report、failover switch）打结构化日志 + 审计，带 `requestId/taskId/sourceId/channelId`；playback report 不含播放 URL 或 token。 |
| Schema / Migration Gate | PASS | 本特性不新增表（复用 channel_streams / canonical_channels / operation_change_sets / recovery_points）；如需加索引通过 Drizzle migration 生成审阅。 |

### Android TV Gate

- **Layering — PASS**: playback report 经 `ClientSessionRepository`（domain port）→
  `ClientApi`（data/Retrofit），`Media3PlaybackSession` 调 application UseCase 不直接依赖
  Retrofit。诊断数据映射在 data 层。
- **Contract — PASS**: `POST /api/open/v1/playback/report` 写入 OpenAPI；TV DTO 契约测试
  验证 `PlaybackReportRequestDto` 字段/枚举兼容。
- **Playback state — PASS**: playback report 不持有或创建 Media3；在 `handleLineError`
  现有诊断点触发，不影响换线序列或播放器单一所有者。
- **Recovery — PASS**: 上报失败（网络不可用）本地暂存 + 网络恢复后重传，不影响当前播放或
  换线（FR-015）。
- **10-foot UI — PASS**: playback report 是后台操作，不引入新 UI 元素。
- **Validation — PASS**: TV JVM 单测覆盖上报 DTO 映射 + 暂存/重传逻辑；MockWebServer 覆盖
  HTTP 错误分类。

### Post-Design Re-check

Phase 1 数据模型和契约复核后全部门禁仍为 PASS。新增的 playback report 接口和 failover
接线均复用现有表结构和 repository token，无 schema 变更。

## Project Structure

### Documentation (this feature)

```text
specs/008-pipeline-reliability/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── openapi.yaml     # playback report endpoint additions
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── application/
│   │   │   ├── open/
│   │   │   │   ├── resolve-playback.use-case.ts       # existing
│   │   │   │   └── report-playback.use-case.ts         # NEW (US3)
│   │   │   ├── operation-safety/
│   │   │   │   └── apply-operation.use-case.ts         # MODIFY (taskType routing)
│   │   │   └── channel-catalog/
│   │   │       ├── sync-m3u-source.use-case.ts         # DELETE (dead code, US1)
│   │   │       └── sync-xmltv-source.use-case.ts       # DELETE (dead code, US1)
│   │   ├── http/open/
│   │   │   ├── open.controller.ts                      # MODIFY (add POST playback/report)
│   │   │   └── open.module.ts                          # MODIFY (wire ReportPlaybackUseCase)
│   │   └── infrastructure/bullmq/
│   │       ├── scheduler.ts                            # MODIFY (fan-out all sources, US1)
│   │       └── task-queue.adapter.ts                   # MODIFY (xmltv schedule registry)
│   └── drizzle/                                        # migration if index needed
│
├── worker/
│   ├── src/
│   │   ├── processors/
│   │   │   ├── m3u-sync.processor.ts                   # MODIFY (trigger reconcile after sync)
│   │   │   ├── xmltv-sync.processor.ts                 # (no change)
│   │   │   ├── stream-check.processor.ts               # MODIFY (call failover evaluate, US3)
│   │   │   └── epg-match.processor.ts                  # MODIFY (remove canonical rebuild, US1)
│   │   ├── application/
│   │   │   ├── operation-safety/
│   │   │   │   ├── reconcile-canonical-channels.use-case.ts  # MODIFY (mergeKey + displayName)
│   │   │   │   └── (6 existing use cases)              # ACTIVATE
│   │   │   └── playback/
│   │   │       └── process-playback-report.ts          # NEW (US3, batch processor)
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   ├── canonical-reconcile.repository.ts   # NEW (US1, Drizzle adapter)
│   │   │   │   ├── source-sync.repository.ts           # NEW (US2, Drizzle adapter)
│   │   │   │   ├── epg-sync.repository.ts              # NEW (US2, Drizzle adapter)
│   │   │   │   ├── restore.repository.ts               # NEW (US2, Drizzle adapter)
│   │   │   │   └── cleanup.repository.ts               # NEW (US2, Drizzle adapter)
│   │   │   └── queue/
│   │   │       └── operation-worker.ts                 # MODIFY (real handlers, US2)
│   │   └── main.ts                                     # MODIFY (remove shadowing, wire safe-op)
│   └── (domain ports already exist)
│
├── web/
│   └── src/                                            # no new pages (reuse existing)
│
└── tv/
    └── app/src/main/kotlin/com/magi/tv/
        ├── playback/
        │   └── Media3PlaybackSession.kt                # MODIFY (report on handleLineError)
        ├── data/
        │   ├── remote/
        │   │   ├── ClientApi.kt                        # MODIFY (add reportPlayback)
        │   │   └── ClientDtos.kt                       # MODIFY (add PlaybackReportRequestDto)
        │   └── repository/
        │       └── DefaultClientSessionRepository.kt   # MODIFY (add reportPlayback port method)
        └── domain/
            └── repository/
                └── ClientSessionRepository.kt          # MODIFY (add reportPlayback port)

packages/
├── types/src/dto/
│   └── playback-report.ts                              # NEW (Zod schema, US3)
├── backend-core/src/
│   ├── processors/
│   │   └── failover-policy.ts                          # NEW (pure decideTarget, shared US3)
│   └── database/schema/                                # no new tables (reuse existing)
```

**Structure Decision**: 复用现有 monorepo 分层。核心改动集中在 Worker（激活 use case、接线
failover、解耦 reconcile）和 API（playback report 接口、定时 fan-out）。TV 端改动最小（上
报 DTO + 触发点）。不新增前端页面。纯决策逻辑（`decideTarget`）下沉 `backend-core` 绕过
Worker 非 NestJS DI 障碍。

## Complexity Tracking

> 本特性无宪法违反。以下记录的是已有的技术债清理，不是新增复杂度。

| 已有债务 | 处理方式 | 理由 |
|----------|----------|------|
| API/Worker 同步逻辑双胞胎 | 删除 API 端 `SyncM3uSourceUseCase` / `SyncXmltvSourceUseCase`（死代码） | 从未在定时路径调用，Worker 版是唯一真相源；保留只会漂移 |
| `channels` 表全量删重建导致 UUID 漂移 | reconcile 改用 channelIdentity 为 membership key（非 UUID） | 治本：identity 稳定，UUID 变化不影响 canonical 映射 |
| epg-match.processor 410 行 god function | 提取 canonical rebuild 为独立 `reconcileCanonicals` 函数 | epg-match 只做 EPG 绑定；canonical 由 m3u-sync 触发 |
