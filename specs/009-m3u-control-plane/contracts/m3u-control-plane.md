# Contract Additions: M3U 控制台

**Feature Branch**: `009-m3u-control-plane`  
**Date**: 2026-08-07

本文件描述对现有管理端与开放接口的增量契约。字段采用现有项目的 JSON 命名与统一响应封装；实际 OpenAPI 文档是跨语言客户端的最终真相源。

## Management Contracts

### Source preview and apply

管理端对 M3U 源发起同步时返回异步任务和 change set 标识。change set 读取结果至少包含：

```yaml
M3uChangeSet:
  id: string
  sourceId: string
  status: preparing | ready | applying | applied | failed | expired | cancelled | restored
  inputFingerprint: string
  sourceVersion: integer
  summary:
    added: integer
    updated: integer
    missing: integer
    unchanged: integer
  requiresConfirmation: boolean
  warnings: ChangeWarning[]
  snapshotExpiresAt: date-time
```

- 正常 change set 可由定时任务自动申请应用。
- `requiresConfirmation=true` 时，只有管理者的显式确认可进入 applying。
- 空快照或 `missing / currentPresent >= 0.25` 必须生成 warning code，且不能自动应用。
- 已过期、来源配置版本改变或不是 `ready` 的 change set 不能应用。

### Merge candidate review

管理端可列出并处理弱信号频道候选。

```yaml
MergeCandidate:
  id: string
  sourceChannelId: string
  canonicalChannelId: string
  method: normalized_name | normalized_name_group
  reasons: string[]
  status: pending | accepted | rejected | stale
  sourceFingerprint: string
  reviewedAt: date-time | null
```

接受候选会创建 manual membership；拒绝候选仅阻止相同来源输入重复建议。候选本身不改变任何输出。

## Output Grant Contracts

### Create, rotate, revoke

管理者可以创建、轮换和撤销 `OutputGrant`。创建和轮换响应只在该次响应中返回一次明文 `playlistUrl`；随后的查询只返回安全摘要。

```yaml
OutputGrantSummary:
  id: string
  displayName: string
  deviceClientId: string | null
  profile: primary | all
  status: active | revoked | expired
  tokenPrefix: string
  lastUsedAt: date-time | null
  expiresAt: date-time | null

OutputGrantIssued:
  grant: OutputGrantSummary
  playlistUrl: string
```

### Player M3U retrieval

```text
GET /api/playlist/v2.m3u?grant=<opaque-secret>
```

- 成功：返回动态生成的 UTF-8 M3U，频道顺序使用统一线路选择策略。
- 无效、过期或已撤销 grant：返回 401，且不泄露 grant 是否曾存在。
- 请求日志、任务日志、审计和错误响应必须脱敏 `grant`。
- Android TV 不使用此 URL grant，继续使用既有 device token 和 Open API。

## Output Publication Contract

管理端输出状态至少包括：

```yaml
OutputPublication:
  revision: string
  status: fresh | stale | blocked
  publishedAt: date-time | null
  channelCount: integer
  playableChannelCount: integer
  excludedChannelCount: integer
  blockingReason: string | null
```

`blocked` 表示当前没有可安全发布的目录；`stale` 表示继续提供上一次可用目录，同时展示原因。

## Health and Playback Contracts

- 现有 `POST /api/open/v1/playback/report` 必须验证 `stream_id` 属于请求的 `channel_id`；不匹配或已删除对象安全忽略，仍返回成功接受结果。
- 单线路检查任务的请求语义必须显式传递 `streamId`，批量/来源检查才传递 `sourceId`。
- 主动检查和播放上报共享相同的健康聚合与故障切换行为。所有播放决策和 M3U 输出引用同一排序结果。
- 线路、候选、grant、播放地址或来源凭据变更不得破坏现有 `/api/open/v1` 的向后兼容读取契约；新增字段遵循 OpenAPI 可选字段规则。
