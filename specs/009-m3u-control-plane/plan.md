# Implementation Plan: M3U 控制台

**Branch**: `009-m3u-control-plane` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: M3U 源、频道编排和受控输出的完整管理闭环。

## Summary

将易变的多源 M3U 输入转化为稳定且可追溯的最终频道目录。实现以快照驱动的安全同步作为唯一写入路径：正常变化自动应用，空目录或 ≥25% 删除待确认；随后以仅相同 `tvg-id` 的保守自动合并、持久人工覆盖和 30 天缺失线路保留完成频道编排。输出按每播放器/设备独立资格动态生成，并让主动探测和真实播放反馈共用一个健康与故障切换决策。

## Technical Context

**Language/Version**: TypeScript 5.8 / Node.js ≥20；Kotlin 客户端只消费开放契约，不参与本功能管理界面。  
**Primary Dependencies**: NestJS、TanStack Start/React、Drizzle、PostgreSQL、Redis/BullMQ、Zod；现有 Android TV Open API 客户端。  
**Storage**: PostgreSQL 存储来源、快照、change set、频道/成员/线路、恢复点、授权、发布状态与健康观察；Redis 用于队列和互斥。  
**Testing**: Vitest（API/Worker/Web 单元与集成）、现有 OpenAPI 契约测试；以可控 M3U fixture 验证异步端到端任务。  
**Target Platform**: Docker 部署的 API、Worker 与 Web 管理端；标准 M3U 播放器和既有 Android TV 消费输出。  
**Project Type**: Monorepo Web 管理后台 + API + 异步 Worker。  
**Performance Goals**: 10,000 频道来源在 30 秒内显示同步进度，成功后 10 秒内给出差异；输出状态对管理者可即时读取。  
**Constraints**: 所有耗时操作异步；来源凭据、grant 与播放地址不进入日志/审计；同步、编排和输出必须幂等、可恢复、跨 API→Worker 带 request/task 链路。  
**Scale/Scope**: 个人/家庭自建首期；100 个已授权播放器、10 个并发来源更新；不包含 DVR、VOD、TV 端管理和 EPG 作为前置条件。

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design: PASS.*

- 后端变更遵循 Controller → UseCase → Domain port → Infrastructure 的单向依赖；快照、合并、健康和授权规则放在 Domain/Application，不在 Controller 或 Worker processor 内复制。
- 所有 M3U 下载、解析、探测、应用、恢复和清理均通过异步任务，API 只返回任务/变更集引用。
- 新增或变更 DTO 与校验集中在 `packages/types`；管理端与 API 共用同一份契约。
- 开放接口变化更新 OpenAPI；Android TV 继续以独立设备令牌使用 Open API，传统播放器仅使用可撤销 URL grant。
- 所有异步边界记录 requestId、taskId、sourceId、changeSetId 和安全脱敏后的上下文。
- 本期不新增 TV 管理 UI；因此 Android TV 焦点和播放器门槛不适用。若修改 TV 的输出消费或播放回报，则必须补齐该门槛。

### Android TV Gate

**Not in implementation scope.** Open API 是兼容边界。任何后续 TV 客户端改动必须更新 `/api/open.json`、验证 DTO 兼容性并独立满足宪法 Principle VIII。

## Project Structure

### Documentation

```text
specs/009-m3u-control-plane/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── m3u-control-plane.md
└── tasks.md                 # 由 /speckit-tasks 生成
```

### Source Code

```text
apps/
├── api/src/
│   ├── application/{operation-safety,output-composition,open,source-management}/
│   ├── domain/{source-sync,output-composition}/
│   ├── http/{source,output,open}/
│   └── infrastructure/{bullmq,database}/
├── worker/src/
│   ├── application/operation-safety/
│   ├── domain/{source-sync,operation-safety}/
│   ├── infrastructure/{database,queue}/
│   └── processors/
└── web/src/
    ├── pages/ or features/ source and output management
    └── services/
packages/
├── backend-core/src/            # pure M3U parsing, identity and diff algorithms
└── types/src/                   # shared DTO and validation schemas
```

**Structure Decision**: 保持现有 API + Worker + Web 单仓结构。Worker 处理所有来源与健康重活；API 提供管理、授权和状态投影；Web 仅展示和发起意图。领域端口隔离持久化和队列实现，`packages/types` 维持 TypeScript 契约唯一真相源。

## Implementation Strategy

1. **统一同步入口**：将手动与定时触发转换为来源范围 change set；保留旧 job 名作为适配器，但不再直接删除/重建频道。完成来源范围租约、条件状态转换、输入指纹复用和来源版本校验。
2. **原子应用与恢复**：应用前写入实际恢复项；在同一事务中 stable upsert、缺失标记、来源状态、成员/线路编排和发布状态更新。异常同步停在待确认，不改变目录。
3. **重建编排事实源**：以 `CanonicalChannelMember` 作为成员关系权威，替换旧的弱名称重建逻辑。仅相同规范化 `tvg-id` 自动合并；新增候选审查与 canonical 级人工覆盖。
4. **管理缺失线路**：来源缺失立即停止输出，30 天内可恢复原身份与健康；清理任务到期处理自动来源关系，不清理手动线路或有活动成员的最终频道。
5. **发布与输出资格**：建立输出发布状态投影和 grant 生命周期；动态 V2 M3U 读取只接受有效 grant，设备 Open API 保持原有 Bearer 模式。
6. **健康收敛**：修复单线路检查参数与播放回报归属校验；新增健康观察与故障切换历史，令所有线路排序消费同一聚合决策。
7. **管理体验与验证**：在现有来源/输出界面呈现任务、差异、异常确认、候选、健康和发布状态；补齐 API、Worker、Web、OpenAPI 与端到端 fixture 测试。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |
