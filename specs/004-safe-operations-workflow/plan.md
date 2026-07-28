# Implementation Plan: 安全运营工作流

**Branch**: `004-safe-operations-workflow` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-safe-operations-workflow/spec.md`

**Note**: `setup-plan.sh` 将本特性标识为 `004-safe-operations-workflow`；当前 Git 工作树仍在 `master`，本规划没有创建或切换分支。

## Summary

把 MAGI 当前直接执行的同步、EPG 匹配、删除、恢复和批量状态修改统一为“预览 → 确认 → 异步应用”的安全运营协议。来源频道通过稳定身份差异更新，标准频道通过持久成员关系保持自身 ID，人工覆盖、生命周期、线路顺序和健康历史不再由自动任务重置。所有高风险应用先创建恢复点，并以审计事件、任务关系、乐观并发版本和幂等键形成可追溯闭环。

交付采用 expand → backfill → shadow preview → 分范围启用新写入 → contract 的渐进迁移。第一阶段先消除同步与匹配的数据破坏风险，随后补齐频道生命周期、匹配工作台、调度任务、备份审计、运营指标和线路故障转移。现有技术栈足以实现本特性，不新增运行时依赖或共享 package。

## Technical Context

**Language/Version**: TypeScript 5.8，Node.js ≥ 20

**Primary Dependencies**: TanStack Start、React 19、TanStack Router、TanStack Query、TanStack Table、Zustand、antd 6；NestJS 11、BullMQ 5、Drizzle ORM、Zod；现有 `@magi/types`、`@magi/backend-core`、`@magi/utils`

**Storage**: PostgreSQL 保存运营状态、变更集、恢复点、调度配置、备份元数据和审计；Redis/BullMQ 保存队列执行状态和调度器运行数据；API/Worker 共同消费 `packages/backend-core` 中的 `BackupObjectStorage` port，各自在 infrastructure 层通过服务端私有目录 adapter 访问同一存储根，采用临时文件 + fsync + 原子 rename，数据库只保存不可外泄的 `storageRef`

**Testing**: Vitest（domain/application/repository/worker）、Testing Library + jsdom（Web 交互）、迁移/回填集成测试、现有 lint/build/typecheck；固定种子的 1k/10k/50k 数据集用于一致性和容量验证；SC-003/005/006 使用至少 20 名首次使用管理员的计时可用性验收

**Target Platform**: Docker / Docker Compose 部署的 Linux 服务端；现代桌面浏览器管理后台

**Project Type**: TypeScript monorepo，包含 Web 管理后台、HTTP API、异步 Worker 和共享 packages

**Performance Goals**: 10,000 个频道的同步或匹配预览摘要在 10 秒内可见；任务提交后 5 秒内出现可跟踪状态；状态变化后 10 秒内出现在全局任务区域；10,000 个频道恢复在 5 分钟内完成

**Constraints**: 人工配置保留率和高风险影响计数准确率必须为 100%；队列为 at-least-once 语义，任务必须可重放；高风险 apply 全有或全无；禁止在日志、审计和备份中泄露凭据；保持单人维护友好；不得引入第二套 UI 或契约真相源

**Scale/Scope**: 当前发布门槛 10,000 个频道，50,000 个频道仅作为容量退化观察；单管理员、多标签页并发；6 条用户旅程、38 条功能需求，影响 Web/API/Worker/共享类型和数据库迁移

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Gate                           | Pre-Research | Post-Design | Plan Evidence                                                                                                                                      |
| ------------------------------ | ------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Clean Architecture          | PASS         | PASS        | Controller/processor 只处理验证、响应或 job 转交；API 与 Worker 各自通过 domain port 隔离 application 与 Drizzle/BullMQ/文件系统                  |
| II. Monorepo + Shared Packages | PASS         | PASS        | 所有 DTO、枚举和 Zod schema 先进入 `packages/types`；Drizzle schema 与跨 API/Worker 的纯算法只在 `packages/backend-core` 定义一次，各 app 仅导入或 re-export |
| III. Domain Independence       | PASS         | PASS        | 生命周期、状态转换、变更分类、人工覆盖和故障转移规则不依赖 NestJS、Drizzle、BullMQ 或 React                                                        |
| IV. Heavy Work Async           | PASS         | PASS        | preview 生成、apply、同步、匹配、检查、备份和恢复均返回 Task 句柄；Worker 承担长任务；短查询和草稿编辑保持同步                                     |
| V. End-to-End Type Safety      | PASS         | PASS        | wire contract 由 `packages/types` 中 Zod schema 唯一定义；API/Web/Worker 共同消费；禁止平行手写接口和 `any`                                        |
| VI. Long-Term Maintainability  | PASS         | PASS        | 复用现有应用和 package；统一一种高风险操作协议；恢复点只覆盖受影响对象；采用分阶段迁移而非一次性重写                                               |
| VII. Observability             | PASS         | PASS        | requestId、taskId、scope、changeSetId、recoveryPointId 贯穿日志和审计；任务记录 start/success/failure/retry/deduplicated/skipped，敏感字段统一脱敏 |
| Fixed Technology Stack         | PASS         | PASS        | 沿用宪法锁定技术；不增加运行时依赖；Drizzle 迁移必须由 `db:generate` 生成并在空库和已回填库执行 `db:migrate`                                       |
| Quality Gates                  | PASS         | PASS        | 规划要求 Red-Green-Refactor、`pnpm lint`、`pnpm build`、各包 typecheck 和 10k 验收数据集                                                           |
| antd Workflow                  | PASS         | PASS        | 所有 UI 实现任务开始前必须执行 `antd design.md`、查询所用组件 API/demo，完成后执行 `antd lint`                                                     |

宪法门禁无失败项。`docs/architecture.md` 中旧前端技术栈描述与宪法冲突，实施时必须按宪法更新文档，不能据此引回 TailwindCSS 或 shadcn。

## Project Structure

### Documentation (this feature)

```text
specs/004-safe-operations-workflow/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── common.md
│   ├── operation-previews.md
│   ├── channels.md
│   ├── tasks.md
│   ├── schedules.md
│   └── backups.md
└── tasks.md                 # 由 /speckit-tasks 生成，本命令不创建
```

### Source Code (repository root)

```text
packages/
├── types/src/
│   ├── dto/                 # operation、channel、task、schedule、backup、audit schema/VO
│   └── enum/                # lifecycle、operation、task、failover 枚举
└── backend-core/src/
    ├── operation-diff/      # 纯差异分类、fingerprint、summary
    └── channel-matching/    # 稳定身份、成员匹配与 EPG 候选计算

apps/api/src/
├── http/
│   ├── operation/           # preview/apply/recovery 接口
│   ├── output/              # 频道生命周期、线路顺序与即时检查
│   ├── task/                # task summary/retry/cancel 与 schedule
│   ├── audit/               # 审计查询
│   ├── backup/              # 备份、恢复预检与下载
│   └── dashboard/           # 运营指标
├── application/
│   ├── operation-safety/
│   ├── output-composition/
│   ├── task-execution/
│   ├── backup/
│   └── audit/
├── domain/
│   ├── operation-safety/
│   ├── output-composition/
│   ├── task-execution/
│   ├── backup/
│   └── audit/
└── infrastructure/
    ├── database/
    │   ├── schema/          # expand/backfill/contract migrations
    │   └── *-repository.ts
    └── queue/

apps/worker/src/
├── domain/                  # job/lease/operation 状态、不变式与 repository/storage ports
├── application/             # 仅依赖 domain ports 与 backend-core 的 preview/apply/sync/match/restore/check 用例
├── infrastructure/         # Drizzle、BullMQ、下载器、私有备份文件 adapter
└── processors/              # 仅校验 job payload 并交给 application

apps/web/src/
├── components/              # 全局 task status、通用 impact/confirmation UI
├── features/dashboard/
│   ├── operations/          # 影响预览、恢复点、审计
│   ├── epg/                 # 匹配工作台
│   ├── channels/            # 生命周期、回收站、线路排序/检查
│   ├── tasks/               # task、schedule 显式编辑
│   ├── backups/
│   └── health/
└── routes/dashboard/        # 页面路由与 URL 筛选状态
```

**Structure Decision**: 保持现有 monorepo 和 Clean Architecture 边界。API 只负责短请求、验证和入队；Worker 从当前直接数据库脚本逐步收敛为 domain/application/infrastructure 分层。纯差异与匹配算法放入现有 `packages/backend-core`，wire contract 放入 `packages/types`。Web 只承载交互和查询缓存，不重复实现业务状态机。

Drizzle schema 同样遵循共享代码单一来源：表定义只存在于 `packages/backend-core/src/database/schema/`，API/Worker 的 schema 入口只能导入或 re-export，不得复制字段定义。Worker application 禁止导入 Drizzle、BullMQ 或 Node 文件系统；这些能力分别通过 domain repository/queue/storage ports 注入。

## Design Overview

### Unified high-risk operation protocol

1. 客户端提交 operation kind、目标稳定 ID、参数和当前版本，创建无副作用 preview。
2. API 创建 `preparing` change set 并返回 TaskRef；Worker 基于不可变输入 fingerprint 生成逐项差异。
3. 管理员查看 summary、warnings、blockers 和分页 change items；必要时选择匹配项或确认警告。
4. apply 只引用 changeSetId，并提交确认代码、expected version 和 Idempotency-Key。
5. Worker 重新校验目标版本与输入 fingerprint，创建恢复点，在目标范围互斥租约内原子应用。
6. 任务完成后写入结果摘要和审计事件；失败可安全重试；完成后的同输入重放产生空差异。

### Stable channel and canonical composition

- `channelIdentity` 继续作为来源频道跨同步身份；同步改为 upsert + missing 标记，不删除再创建。
- 标准频道 ID 不再由每次匹配重建；新增规范化成员关系表达来源频道归属，逐步替代 `mergedFromIds` 文本。
- `channel_overrides` 继续作为人工元数据真相源；非空人工字段和人工 EPG lock 永远优先于自动结果。
- 匹配只更新草案和成员/绑定差异，apply 时按现有标准频道增量更新；线路、健康记录和手工线路保留。

### Lifecycle, recovery and audit

- 单一生命周期 `active | hidden | disabled | trashed` 取代多个可能冲突的布尔状态；永久 purge 是单独高风险操作。
- 来源是否仍存在是正交属性，不能改变运营生命周期。
- 高风险操作创建仅包含受影响对象的恢复点；恢复同样走 preview/apply。
- 审计事件追加写入，保存变更摘要和引用，不复制敏感正文。

### Task, schedule and failover

- 持久任务增加 scope、目标、父子关系、idempotency key、requestId 和 result summary。
- 队列去重 + 持久目标租约双层防重；同目标同步/匹配/恢复/purge 互斥，不同来源可并发。
- 调度配置进入持久真相源，Save 才生效，Cancel 只丢弃草稿；默认重叠策略为 `skip`。
- 线路采用唯一顺序和单一主线路约束；自动故障转移按已保存 policy 运行并审计。

### Retention and private backup storage

- 可恢复删除、recovery point 和配置备份默认保留 30 天；operation preview/change set 及其 snapshot 默认保留 24 小时；idempotency record 至少保留 24 小时。
- operation lease 使用 2 分钟 TTL 和 30 秒 heartbeat；只有超过 TTL 且不存在活动任务引用时才允许回收。
- 审计事件长期追加，不进入运营对象清理任务。所有列表、详情和高风险确认显示实际 `expiresAt`/`purgeAfter`。
- `BackupObjectStorage` port 在 `packages/backend-core` 定义一次，API/Worker 分别提供 infrastructure adapter 并访问同一私有存储根。首个 adapter 使用临时文件、校验和、fsync 和原子 rename；下载必须经授权 use case，API 永不返回 `storageRef`。

## Delivery Sequence

1. **Expand foundation**: 共享 schema、版本字段、新表、新索引、兼容读路径、审计/恢复基础和完整 1k/10k 确定性测试夹具。
2. **Backfill and shadow**: 先完成 rollout runbook 评审，再回填生命周期、标准频道成员和线路顺序；生成冲突报告；新 diff 只做 shadow preview。
3. **P1 safe sync/match**: 开启来源差异 upsert、change set、人工覆盖保护、恢复点；停止全量删除重建路径。
4. **P1 lifecycle**: 上线全部状态视图、回收站、恢复和永久 purge；批量选择绑定稳定 ID。
5. **P2 matching workbench**: 上线四类匹配、confidence/reason、人工 lock 和批量接受。
6. **P2 tasks/schedules/audit/backup**: TaskRef/全局状态、持久调度、审计浏览、备份和恢复预检。
7. **P3 operations/failover**: 新鲜度与覆盖率首页、线路排序、即时检查、自动切换与恢复策略。
8. **Contract cleanup**: 观察期通过后移除旧字段和破坏性执行路径，更新架构文档。

每一阶段必须可独立部署，具备数据一致性门槛、停止条件和恢复路径。rollout runbook 必须在任何 shadow 或新写入开关创建/启用前完成评审；旧破坏性路径只有在 10k shadow 对比、恢复演练和人工字段全量校验通过后才能关闭。

## Requirement Traceability

| Requirements  | Design/Contract Coverage                                                                                                               | Validation               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR-001–FR-011 | ChangeSet、Snapshot、RecoveryPoint；[operation-previews.md](./contracts/operation-previews.md)                                         | Quickstart 1–5、11       |
| FR-012–FR-018 | Canonical lifecycle、trash/purge、RecoveryPoint；[channels.md](./contracts/channels.md)                                                | Quickstart 6、11         |
| FR-019–FR-021 | AuditEvent、OutboxEvent、ConfigBackup；[backups.md](./contracts/backups.md)、[common.md](./contracts/common.md)                        | Quickstart 5、11–12      |
| FR-022–FR-027 | ScheduledJobConfig、Task extensions、target-scoped pending；[schedules.md](./contracts/schedules.md)、[tasks.md](./contracts/tasks.md) | Quickstart 8–9           |
| FR-028–FR-030 | Operations summary read model、source policy summary；[common.md](./contracts/common.md)                                               | Quickstart 13            |
| FR-031–FR-034 | ChannelStream order、ChannelFailoverPolicy；[channels.md](./contracts/channels.md)                                                     | Quickstart 10            |
| FR-035–FR-036 | 各契约 UI obligations 与统一 error/terminology                                                                                         | Quickstart 6–10、13      |
| FR-037–FR-038 | TaskRef、trace relations、structured progress/audit                                                                                    | Quickstart 3、5、8–9、11 |

## Complexity Tracking

无宪法违规需要例外。新增持久化实体来自至少三个实际用例（同步/匹配/恢复，频道/来源删除，备份导入），且统一复用同一 change-set/recovery/audit 模型，比为各页面分别实现确认和回滚更简单。

### 宪法 v2.0.0 UI 迁移边界（澄清）

宪法 2.2.0 同步影响报告列出的 v2.0.0 代码层迁移待办（删除 `packages/ui` 的 shadcn 相关依赖、删除 `components.json`、`apps/web/package.json` 移除 `@tailwindcss/vite`/`tailwindcss` 并新增 antd v6、`apps/web/vite.config.ts` 移除 Tailwind 插件、入口移除 Tailwind preflight 改为 antd `App`/`ConfigProvider` 包裹等）**不由本特性实现**：这些代码层改动由当前 Git 工作树中已有的、未提交的 UI 迁移变更承担，必须原样保留，本特性不在这些文件上重做迁移或回退。

本特性对宪法 v2.0.0 迁移的职责仅限文档对齐，由 T132 承担：更新 `README.md` 与 `docs/architecture.md` 的前端栈描述（移除 Tailwind/shadcn 字样、补 antd v6 选型理由），以消除宪法 L193 指出的"文档与宪法冲突"。T001（含宪法 2.2.0 `design.md` 视觉语言摘录）与 T133（视觉语言 lint）覆盖 v2.1.0 + v2.2.0 的 antd 编写流程约束。

记录此边界以避免合规评审误判本特性"未完成宪法迁移代码部分"——那部分迁移在 UI 迁移工作树中独立验收，不进入本特性的任务门禁。
