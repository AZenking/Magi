# Data Model: 数据管线可靠性与播放反馈闭环

**Feature Branch**: `008-pipeline-reliability`
**Date**: 2026-08-04

## 概述

本特性**不新增数据库表**——所有改动复用现有 schema。以下记录的是现有表中与本特性相关的
列变更（新增列或语义变更），以及新增的领域实体（无持久化，仅运行时）。

## 现有表变更

### `channel_streams`（新增 1 列）

| 列名 | 类型 | 可空 | 默认 | 说明 |
|------|------|------|------|------|
| `last_playback_report_at` | `timestamp(tz)` | YES | NULL | 最后一次客户端播放上报时间。与现有 `last_checked_at`（主动探测）区分，用于诊断两种健康度信号的时效性。 |

> 健康度列复用现有：`health_status`、`consecutive_failures`、`success_rate`、
> `stream_error`、`last_success_at`。playback report 和 stream-check 写同一组列。

### `content_manifest`（语义变更，无新列）

`catalog_revision` 当前仅在 `epg-match.processor` 中 bump。解耦后：
- M3U 同步 + reconcile 完成后 bump `catalog_revision`（新增触发点）。
- XMLTV 同步后 bump `epg_revision`（已有，不变）。
- EPG 匹配后 bump `epg_revision`（已有，不变），但不再 bump `catalog_revision`。

## 新增领域实体（运行时，无持久化）

### PlaybackReport

```text
PlaybackReport {
  deviceClientId: string          // 上报设备的标识（来自 device principal）
  channelId: string               // canonical channel ID（"magi:{uuid}" 格式）
  streamId: string                // channel_streams.id（失败/成功的线路）
  outcome: "failure" | "success"  // 播放结果
  errorKind: string | null        // "network" | "http" | "decoder" | "source" | "timeout" | null(成功时)
  playedDurationMs: number        // 已播放时长（失败时为失败前的时长；成功时为首帧耗时）
  reportedAt: string              // ISO-8601，客户端上报时间
}
```

**验证规则**（Zod，FR-010/FR-014）:
- `outcome` 必须是 `"failure"` 或 `"success"`。
- `errorKind` 在 `outcome="success"` 时必须为 null；`outcome="failure"` 时必须是枚举值之一。
- `streamId` 必须存在且属于 `channelId` 对应的 canonical channel（否则忽略，不抛错——FR：线路可能已被管理员删除）。
- 同一 `deviceClientId + streamId` 在 10 秒窗口内的重复 `failure` 上报去重（FR-014）。

### FailoverDecision（运行时）

```text
FailoverDecision {
  canonicalChannelId: string
  previousPrimaryStreamId: string | null
  newPrimaryStreamId: string | null    // null = 无可用备线路（output loss）
  triggerReason: "probe-failure" | "playback-report" | "manual"
  policyApplied: FailoverPolicyData
  decidedAt: string (ISO-8601)
}
```

### SyncJobResult（运行时，定时同步批量结果）

```text
SyncJobResult {
  sourceId: string
  sourceType: "m3u" | "xmltv"
  status: "success" | "failed"
  channelCount: number              // 处理的频道数
  errorReason: string | null        // 失败时的原因
  durationMs: number
}
```

定时同步的"协调 job"（sourceId=null）返回 `SyncBatchResult`：

```text
SyncBatchResult {
  results: SyncJobResult[]          // 每个源的结果
  totalSources: number
  succeededSources: number
  failedSources: number
}
```

## 现有表（无变更，仅引用）

| 表 | 用途 | 本特性角色 |
|----|------|-----------|
| `channels` | 原始导入频道（中间层） | m3u-sync 写入；reconcile 读取 channelIdentity |
| `canonical_channels` | 输出频道（归一化） | reconcile 重建/更新；failover 切换 primaryStreamId |
| `channel_streams` | 播放线路 | reconcile 重建；stream-check 更新 health；playback report 更新 health；failover 切换 isPrimary |
| `canonical_epg_bindings` | EPG 绑定 | epg-match 更新（仅绑定，不再重建 canonical） |
| `channel_overrides` | 人工覆盖 | reconcile 读取（customName/Group/Logo） |
| `operation_change_sets` | 安全操作变更集 | safe-op apply 更新状态 |
| `recovery_points` / `recovery_point_items` | 恢复点 | safe-op apply 写入；restore 读取 |
| `sync_logs` | 同步日志 | 每个子同步 job 记录一条 |

## 状态流转

### channel_streams.health_status

```text
                 probe success / playback success
          ┌──────────────────────────────────────────┐
          ▼                                          |
     ┌─────────┐  probe fail / report fail (×1-2)  │
     │ online  │ ──────────────────────────────────► │
     └─────────┘                                    ▼
          ▲                              ┌───────────┐
          │ probe fail / report fail (×3+)│ degraded  │
          │                              └───────────┘
          │                                    │
          │              probe fail (×3+) /    │
          │              report fail (×3+)     ▼
          │                              ┌───────────┐
          └──────────────────────────────│  offline  │
              probe success              └───────────┘
```

阈值 `consecutiveFailures >= 3` → offline；`>= 1` → degraded；`0` → online。两种信号（probe
和 report）递增同一计数器，成功归零。

### operation_change_sets.status（safe-op）

```text
pending → previewing → ready → applying → applied
                 ↓          ↓         ↓
              cancelled  cancelled  failed (→ rollback via recovery point)
```
