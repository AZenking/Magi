# Research: 数据管线可靠性与播放反馈闭环

**Feature Branch**: `008-pipeline-reliability`
**Date**: 2026-08-04

## R1: 定时同步 fan-out 模式

**Decision**: 定时同步投递一个"协调 job"（sourceId=null），Worker 端 processor 检测到 null
时遍历所有 enabled 源，为每个源 fan-out 投递独立的子 job。

**Rationale**: 改动集中在 `m3u-sync.processor.ts` 和 `xmltv-sync.processor.ts` 的开头判断
逻辑，不需要改变 scheduler.ts 的投递结构（它已经投 null）。每个源作为独立 BullMQ job
执行，单个源失败不影响其他源（FR-004），且天然获得 BullMQ 的重试和并发控制。

**Alternatives considered**:
- **scheduler 端 fan-out**（API 列举所有源后逐个投递）：需要 API 端知道源列表，增加
  API→Worker 耦合，且 scheduler 的 repeat job 无法动态变更源列表。
- **新增专门的"batch-sync" JobKind**：过度设计，null 语义 + processor 内 fan-out 更简洁
  （YAGNI，constitution VI）。

## R2: canonical 解耦策略

**Decision**: 将 `epg-match.processor.ts` L73-482 的 canonical 重建逻辑提取为独立函数
`reconcileCanonicals(changes)`，在 `m3u-sync.processor.ts` 同步完成后调用。EPG 匹配处理
器只保留 EPG 绑定逻辑（L17-69），不再重建 canonical。

**Rationale**: 现有 `ReconcileCanonicalChannelsUseCase` 设计为 1:1（sourceChannelId ↔
canonicalChannelId），不支持 N:1 merge。但 epg-match.processor 中的合并逻辑（computeMergeKey
分组 + survivor 选择 + override 合并）已经成熟且正确。提取它为独立函数比重写
ReconcileUseCase 风险更低（不改算法输出）。

**Alternatives considered**:
- **激活 ReconcileCanonicalChannelsUseCase 并扩展 mergeKey**：需重写合并逻辑 + 写 5 个
  Drizzle adapter，工作量大且与现有 merge 结果可能不一致。
- **M3U 同步后自动触发 epg-match**：会让"没有 XMLTV 源"的环境也无法生成 canonical（因为
  epg-match 依赖 raw_xmltv_channels），不满足 FR-001。

## R3: channelIdentity 为 membership key（修复 UUID 漂移）

**Decision**: canonical reconcile 使用 `channel.channelIdentity`（稳定串）而非 `channel.id`
（易变 UUID）作为 canonical 与 source channel 的关联键。

**Rationale**: `m3u-sync.processor.ts:62` 每次 sync 全量删除重建 `channels` 表，`id` 是
`randomUUID()`，每次都变。而 `channelIdentity` 是 `generateChannelIdentity(sourceId, entry)`
生成的稳定串（基于源 ID + 频道名/URL）。epg-match.processor L92-107 的 overrideByIdentity
兜底逻辑已经证明 identity 是正确的稳定键。

**Alternatives considered**:
- **改 m3u-sync 用 stableUpsert 保 UUID**：这是 004 spec 的 US1 目标（T130），但需要先移
  除旧路径门禁。本特性不阻塞于它——用 identity key 可以在 stableUpsert 落地前就修复问题。

## R4: Safe Operations 激活——taskType 路由修复

**Decision**: 统一 API→Worker 的 taskType 映射。`ApplyOperationUseCase` enqueue 时 payload
的 `jobName` 设为 `operation-prepare` / `operation-apply`，Worker 端 `main.ts` QUEUE_CONFIG
已将这两个 kind 绑到 source-sync 队列。移除 main.ts L72-118 的 inline shadowing handler，
改为调用 `registerOperationHandlers`（operation-worker.ts）注入真实 use case。

**Rationale**: 当前断裂根因是 main.ts 抢先注册了 inline handler，导致
`registerOperationHandlers` 被跳过（worker-bootstrap.ts L56-62 的 `has()` 检查）。移除 inline
版本后，operation-worker.ts 的 handler 生效，但它当前是 stub——需要替换为真实 use case 调用。

**Alternatives considered**:
- **保留 inline handler 但修复 apply 逻辑**：inline handler 无法注入 NestJS use case（它是
  纯函数闭包），需要手动 new 所有依赖，违背分层。
- **把 Worker 改成 NestJS 应用**：过度改造（YAGNI），Worker 用纯函数 + 手动 DI 是已有约定。

## R5: Worker DI 障碍——decideTarget 纯函数下沉

**Decision**: 将 `ChannelFailoverPolicyModel.decideTarget()` 的纯决策逻辑提取为
`packages/backend-core/src/processors/failover-policy.ts` 的独立纯函数
`decideFailoverTarget(primary, backups, policy)`，供 API（`EvaluateStreamFailoverUseCase`）
和 Worker（`stream-check.processor.ts`）共享调用。

**Rationale**: `EvaluateStreamFailoverUseCase` 是 NestJS `@Injectable`，Worker processor 是
纯函数，无法共享实例。`decideTarget` 本身无任何框架依赖（输入是纯数据结构，输出是
streamId），下沉到 backend-core 是 constitution II（共享包）的正确用法。

**Alternatives considered**:
- **Worker 端 new 一个非 DI 的 evaluator**：重复 API 端逻辑，漂移风险。
- **把 stream-check 改成调 API 的 HTTP 端点**：增加网络跳转和故障点，过度设计。

## R6: playback report 健康度合并规则

**Decision**: playback report 更新 `channel_streams.consecutiveFailures`（失败+1 / 成功归零）
和 `healthStatus`（>=3 → offline, >=1 → degraded, 0 → online），与 stream-check 的主动探测
使用完全相同的列和阈值。两种信号自然合并——无论来自 probe 还是 report，都写同一列。

**Rationale**: 不需要额外的"信号源"字段或合并器。`consecutiveFailures` 是单调计数器，两种
信号都会递增它。`lastCheckedAt`（probe）和新增的 `lastPlaybackReportAt`（report）可区分信
号来源用于诊断，但健康度计算不需要区分。

**Alternatives considered**:
- **加权合并（probe 权重 > report 权重）**：复杂且无明确收益，YAGNI。
- **独立 playback-health 列**：需要 schema 变更 + 新合并逻辑，过度设计。

## R7: TV playback report 暂存与重传

**Decision**: TV 端在 `handleLineError` 触发时立即尝试上报；若网络失败，将 report 放入
内存暂存队列（上限 20 条），在心跳成功或网络恢复时批量重传。

**Rationale**: 心跳每 60s 发送一次，是天然的重传触发点。暂存用内存（非 DataStore 落盘），
因为播放失败是瞬态事件，App 重启后历史失败不再有健康度参考价值。上限 20 条防止内存膨胀。

**Alternatives considered**:
- **DataStore 持久化暂存**：增加 I/O 开销，播放失败是瞬态的，不值得持久化。
- **不暂存，直接丢弃**：网络不稳定时会丢失有价值的健康度信号，降低数据质量。

## R8: restore 模式（auto_restore_primary）的冷却判断

**Decision**: 本特性只实现 `auto_keep_fallback` 模式的自动切换（主线路失败 → 切备线路）。
`auto_restore_primary` 模式（备线路恢复后切回原主线路）的冷却判断（cooldownSeconds /
recoveryThreshold / lastSwitchAt）暂不实现，标记为后续增强。

**Rationale**: `decideTarget` 当前只用了 `failureThreshold`（主线路连续失败次数），冷却恢复
逻辑在 `ChannelFailoverPolicyModel` 中未实现。补全它需要额外的状态管理和测试，且当前产品
需求（FR-013）只要求"考虑恢复"，不要求自动切回。YAGNI——先打通主备切换闭环，恢复模式后续
迭代。

**Alternatives considered**:
- **本特性完整实现 restore 模式**：范围膨胀，且无真实数据验证恢复策略参数。
