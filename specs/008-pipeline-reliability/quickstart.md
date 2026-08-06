# Quickstart Validation: 数据管线可靠性与播放反馈闭环

**Purpose**: 在实现完成后验证定时同步、canonical 解耦、安全操作、播放上报和自动换线的端
到端行为。
**Contracts**: [OpenAPI](./contracts/openapi.yaml)
**Data Model**: [data-model.md](./data-model.md)

## 1. Prerequisites

- Node.js ≥20、pnpm 10、Docker/Docker Compose。
- JDK 17+、Android SDK 35、Android TV 模拟器（播放上报验证）。
- 至少一个可用的 M3U 源 URL 和一个 XMLTV 源 URL。
- 两个测试账户（admin + 普通用户）。
- 测试数据库 `magi_test` 已迁移到最新。

```bash
bash scripts/init-dev.sh
```

## 2. US1 验证：同步后自动看到输出频道

### 2.1 单源 M3U 同步后生成 canonical

```bash
# 1. 创建 M3U 源
curl -X POST http://localhost:3001/sources \
  -H "Cookie: <session>" \
  -H "Content-Type: application/json" \
  -d '{"type":"m3u","name":"test-m3u","url":"<m3u-url>","enabled":true}'
# 记录返回的 sourceId

# 2. 同步 M3U
curl -X POST http://localhost:3001/sources/m3u/<sourceId>/sync \
  -H "Cookie: <session>"
# 返回 202 + taskId，等待任务完成

# 3. 验证输出频道已生成（不需要先跑 EPG 匹配）
curl http://localhost:3001/output/channels \
  -H "Cookie: <session>" | jq '.data.items | length'
# 预期：> 0（同步后立即可见）

# 4. 验证每条频道至少有一条线路
curl http://localhost:3001/output/channels/<channelId>/streams \
  -H "Cookie: <session>" | jq '.data.items | length'
# 预期：>= 1
```

**验收断言**:
- M3U 同步完成后，`GET /output/channels` 非空。
- 每条频道至少一条 stream，第一条 `isPrimary=true`。
- 频道名称/分组来自 M3U 源数据。

### 2.2 人工配置保留

```bash
# 1. 给某频道改名（人工覆盖）
curl -X PUT http://localhost:3001/output/channels/<channelId> \
  -H "Cookie: <session>" \
  -d '{"displayName":"我的客厅电视"}'

# 2. 重新同步 M3U
curl -X POST http://localhost:3001/sources/m3u/<sourceId>/sync \
  -H "Cookie: <session>"

# 3. 验证人工名称保留
curl http://localhost:3001/output/channels/<channelId> \
  -H "Cookie: <session>" | jq '.data.displayName'
# 预期："我的客厅电视"（不被同步覆盖）
```

### 2.3 定时同步遍历所有源

```bash
# 1. 配置定时同步（或手动触发定时 job）
# 2. 检查 sync_logs 记录
docker exec magi-postgres psql -U magi -d magi \
  -c "SELECT source_id, source_type, status FROM sync_logs ORDER BY created_at DESC LIMIT 10"
# 预期：每个 enabled 源都有一条记录，status=success

# 3. 验证无 null sourceId 的失败记录
docker exec magi-postgres psql -U magi -d magi \
  -c "SELECT count(*) FROM sync_logs WHERE source_id IS NULL AND status='failed'"
# 预期：0
```

## 3. US2 验证：安全操作预览与回滚

### 3.1 预览无副作用

```bash
# 1. 发起安全同步操作，获取预览
curl -X POST http://localhost:3001/operations/prepare \
  -H "Cookie: <session>" \
  -d '{"scopeType":"m3u_sync","scopeId":"<sourceId>"}'
# 记录返回的 changeSetId

# 2. 验证预览阶段输出频道未变
curl http://localhost:3001/output/channels \
  -H "Cookie: <session>" | jq '.data.items | length'
# 预期：与操作前相同（预览无副作用）

# 3. 验证预览中显示的变更数量
curl http://localhost:3001/operations/<changeSetId> \
  -H "Cookie: <session>" | jq '.data.summary'
# 预期：显示 addedCount/updatedCount/missingCount
```

### 3.2 应用 + 回滚

```bash
# 1. 应用变更
curl -X POST http://localhost:3001/operations/<changeSetId>/apply \
  -H "Cookie: <session>"
# 记录返回的 recoveryPointId

# 2. 验证输出已更新
curl http://localhost:3001/output/channels | jq '.data.items | length'
# 预期：变化（与预览一致）

# 3. 回滚
curl -X POST http://localhost:3001/operations/<changeSetId>/restore \
  -H "Cookie: <session>" \
  -d '{"recoveryPointId":"<recoveryPointId>"}'

# 4. 验证恢复到操作前
curl http://localhost:3001/output/channels | jq '.data.items | length'
# 预期：回到操作前的数量
```

## 4. US3 验证：播放上报与自动换线

### 4.1 播放失败上报

```bash
# 用 device token 上报播放失败
curl -X POST http://localhost:3001/api/open/v1/playback/report \
  -H "Authorization: Bearer <device-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "magi:<channelId>",
    "stream_id": "<streamId>",
    "outcome": "failure",
    "error_kind": "network",
    "played_duration_ms": 2000,
    "reported_at": "2026-08-04T12:00:00Z"
  }'
# 预期：200 { success: true, data: { accepted: true } }

# 验证线路 consecutiveFailures 增加
docker exec magi-postgres psql -U magi -d magi \
  -c "SELECT id, consecutive_failures, health_status FROM channel_streams WHERE id='<streamId>'"
# 预期：consecutive_failures >= 1
```

### 4.2 重复上报去重

```bash
# 10 秒内连续上报同一线路失败
for i in $(seq 1 5); do
  curl -X POST http://localhost:3001/api/open/v1/playback/report \
    -H "Authorization: Bearer <token>" \
    -d '{"channel_id":"magi:<id>","stream_id":"<streamId>","outcome":"failure","error_kind":"network","played_duration_ms":0,"reported_at":"2026-08-04T12:00:0'$i'Z"}'
done

docker exec magi-postgres psql -U magi -d magi \
  -c "SELECT consecutive_failures FROM channel_streams WHERE id='<streamId>'"
# 预期：递增受去重控制（10s 窗口内不重复 +1）
```

### 4.3 自动主备切换

```bash
# 1. 确认某频道有主备线路
curl http://localhost:3001/output/channels/<channelId>/streams | jq '.data.items[] | {id,isPrimary}'

# 2. 对主线路连续上报 3 次失败（或等待 stream-check）
for i in $(seq 1 3); do
  curl -X POST http://localhost:3001/api/open/v1/playback/report \
    -H "Authorization: Bearer <token>" \
    -d '{"channel_id":"magi:<id>","stream_id":"<primaryStreamId>","outcome":"failure","error_kind":"http","played_duration_ms":0,"reported_at":"2026-08-04T12:0'$i':00Z"}'
  sleep 1  # 超过去重窗口
done

# 3. 验证主备已切换
curl http://localhost:3001/output/channels/<channelId>/streams | jq '.data.items[] | {id,isPrimary}'
# 预期：原 primary 的 isPrimary=false，某备线路 isPrimary=true
```

### 4.4 TV 端换线上报

在 Android TV 模拟器上：
1. 配置 TV 连接到测试服务器。
2. 播放一个有多条线路的频道。
3. 模拟主线路失败（如用 MockWebServer 返回 503）。
4. 验证 TV 自动切换到备线路。
5. 检查服务端日志确认收到 playback report。

### 4.5 并发上报不重复切换

```bash
# 模拟 10 台 TV 同时上报同一线路失败
for i in $(seq 1 10); do
  (curl -X POST http://localhost:3001/api/open/v1/playback/report \
    -H "Authorization: Bearer <token-$i>" \
    -d '{"channel_id":"magi:<id>","stream_id":"<streamId>","outcome":"failure","error_kind":"network","played_duration_ms":0,"reported_at":"2026-08-04T12:00:'$i'Z"}' &)
done
wait

# 验证只发生一次主备切换
docker exec magi-postgres psql -U magi -d magi \
  -c "SELECT count(*) FROM audit_events WHERE action='channel.stream.set_primary' AND target_id='<channelId>'"
# 预期：1（不因并发重复切换）
```

### 4.6 TV 端播放器行为验证（代码审查结论）

**T048 — playback report 不影响播放器**：
- `reportPlayback` 回调在 `handleLineError` 的 `diagnosticsRepository.recordEvent` **之后**调用，
  是纯副作用回调，不修改 `PlayerUiState`、不持有或创建 Media3 实例。
- 换线序列（`startLine(nextLineIndex)`）在 report 回调之后执行，顺序不变。
- 焦点恢复由 `PlayerUiState` 状态机管理，不受 report 回调影响。
- **结论**：播放器单一所有者、换线序列和焦点恢复无行为退化。✅

**T049 — 暂存/重传验证**：
- `DefaultClientSessionRepository` 使用 `Channel<PlaybackReport>(capacity=20, DROP_OLDEST)` 暂存。
- 网络失败时 `trySend(report)` 入队；心跳成功后 `flushPendingPlaybackReports()` 逐条重传。
- `ClientHeartbeatCoordinator.runLoop` 中心跳成功后调用 flush。
- **结论**：暂存/重传逻辑编译通过、TV 单测覆盖。MockWebServer 端到端验证待真机/模拟器。✅

### 4.7 Android TV 模拟器验收（待人工执行）

| Scenario | 状态 | 备注 |
|----------|------|------|
| 播放失败上报 | 代码就绪 | `handleLineError` 触发 `reportPlayback`，DTO 映射由 `PlaybackReportTest.kt` 覆盖 |
| 自动换线 | 代码就绪 | `startLine(nextLineIndex)` 在 report 之后执行 |
| 断网恢复后重传 | 代码就绪 | `Channel(20, DROP_OLDEST)` 暂存 + 心跳成功后 flush |
| 播放器焦点恢复 | 无退化 | report 回调不修改 PlayerUiState |

需连真实 Android TV 设备 + 遥控器执行最终验收。

## 5. Repository-Wide Final Gates

```bash
pnpm lint
pnpm build
DATABASE_URL=postgres://magi:magi@localhost:15432/magi_test pnpm --filter @magi/api test
pnpm --filter @magi/web test
cd apps/tv && ./gradlew :app:lintDebug :app:testDebugUnitTest :app:assembleDebug
```

秘密扫描（playback report 不应包含播放 URL）：

```bash
rg -n 'Authorization: Bearer|refresh_token|stream_url|playback_url' \
  apps/api/dist apps/web/dist 2>/dev/null | grep -v node_modules
# 预期：0 真实秘密
```
