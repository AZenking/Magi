# Phase 0 Research: 客户端管理与心跳

> **部署决策更新**：默认 TV 流程改为自动登记到配置的默认账户；RFC 8628 设备授权仅保留给旧版本兼容，不再作为新 TV 的用户交互步骤。

**Date**: 2026-07-31
**Feature**: [spec.md](./spec.md)

本研究解决代码现状与规格假设之间的关键缺口：当前 `oauth_clients` 是软件/集成凭证，
Android TV 使用编译进 APK 的共享 Client Secret；仓库中不存在可信的“账户 × 安装实例”
注册。共享凭据无法区分两台电视，也无法按设备撤销或归属到登录账户。

## Decision 1 — 独立建模设备实例

**Decision**: 新增 `device_clients` 领域与表，表示一次安装/清数据周期内的账户设备实例。
保留 `oauth_clients` 表示 OAuth 软件客户端注册：

- `oauth_clients`: “哪个软件/集成在访问”，分为 confidential integration 与 public
  device app。
- `device_clients`: “当前账户下哪一个安装实例在访问”，唯一归属 `user.id`。
- better-auth `session`: 只认证 Web 交互式会话，不承担 TV 设备生命周期。

设备 Token 同时关联 OAuth software client 和 `device_client_id`。所有设备管理 DTO 使用
`DeviceClient*`/`AccountClient*` 命名，不复用 `OauthClientVo`。

**Rationale**: 当前 `oauth_clients.clientId` 全局唯一，生命周期是启用/禁用/吊销应用凭证；
一台物理电视的在线、名称和撤销是另一种生命周期。分离后可保持账户隔离、逐设备撤销和
既有开放接口脚本兼容。

**Alternatives considered**:

- 直接扩展 `oauth_clients`: 把应用注册、API 脚本凭证和设备实例混为一表，并不能解决
  APK 共享 secret，拒绝。
- 复用 better-auth session/device: 浏览器 Cookie 会话的过期、IP/User-Agent 和退出语义
  不适合 TV bearer 与长期设备授权，拒绝。
- 使用 ANDROID_ID、MAC 或硬件指纹: 可重置、可伪造且增加隐私风险，拒绝。每次安装生成
  随机身份，重装/清数据按规格产生新客户端。

## Decision 2 — RFC 8628 仅作为旧客户端兼容

原方案使用 RFC 8628 让 Web 用户批准 TV 短码；按最新产品决策，新版本不再走该交互。
新 TV 使用公开 client id + 稳定 installation id 调用自动登记接口，由服务端将其归属默认账户。
保留 RFC 8628 端点是为了迁移旧 APK 和已有授权，不应在新 UI 或新客户端中再次引导用户。

**Decision**: Android TV 作为 public native client，首次启动使用公开 `client_id` 和随机
`installation_id` 调用自动登记接口。服务端按配置的默认管理员用户名解析账户，在唯一的
`(oauth_client_id, installation_id)` 约束下原子创建或复用 `device_client`，返回 1 小时
Access Token 与旋转 Refresh Token。TV 只保存加密刷新凭据，随后由前台协调器发送心跳。

RFC 8628 端点、短码和 Web 批准逻辑保留给旧版本迁移，但新版本不展示短码、不轮询，也不在
Web 管理页提供绑定按钮。安装标识不是账户凭据，Token 仍以不可逆 hash 持久化，Refresh
Token family 重放仍按安全规则终结。

**Rationale**: 产品明确要求无人工配对；公开 native client 不携带可信任的静态 secret，
因此使用服务端默认账户 + 稳定安装标识完成无输入登记，并用轮换 Refresh Token、撤销和
限流控制冒用风险。RFC 8252 的 public-client 约束仍适用于客户端凭据设计。

**Alternatives considered**:

- 手输 Client ID/Secret: 10-foot UX 差，静态 app secret 也不是可信设备证明，拒绝。
- 用共享 OAuth Token + 客户端上报 UUID 自动注册: UUID 单独不足以证明设备，但在本方案中
  只作为幂等安装键；实际访问仍需要服务端签发并可撤销的轮换 Token，接受该方案。
- DPoP/硬件证明: 安全性更强，但首期复杂度显著高；旋转 Refresh Token 足以覆盖当前风险，
  可在真实威胁证据出现后再评估。

## Decision 3 — Refresh Token rotation 与即时撤销

**Decision**:

- 设备 Access Token 沿用有状态 Token 基础设施并新增 `deviceClientId`、`grantType`、
  `scope`；integration Token 的 `deviceClientId` 保持 null。
- 新增只服务设备的 hashed Refresh Token 表。每次 refresh 原子消费旧 Token、签发新
  Access/Refresh Token 并递增 generation。
- 已消费 Refresh Token 再次出现视为 replay，撤销整个 token family 并要求重新授权。
- Refresh Token 30 天不活跃过期；每次合法 rotation 滑动续期。Access Token 继续 1 小时。
- 设备撤销事务同时设置设备终态、撤销该设备全部 Access Token 和 Refresh Token family，
  并追加无秘密审计事件。

**Rationale**: Public client 无法安全持有 APK 级静态 secret。RFC 9700 要求 public client
的 Refresh Token 使用 sender constraint 或 rotation；rotation 在当前技术栈内复杂度更低。
有状态 Access Token 让撤销无需等待到期即可生效。

**Alternatives considered**:

- 永不过期、不可旋转的设备 secret: 一旦复制无法检测重放，拒绝。
- 只用短期 Access Token、每小时重新配对: 用户体验不可接受，拒绝。
- DPoP sender-constrained token: 首期暂缓；需要新的 key proof、nonce 与跨端契约。

## Decision 4 — PostgreSQL 是 presence 与竞态真相源

**Decision**:

- 持久状态只有 `active → revoked`；`online/offline` 不落库。
- 列表查询以数据库当前时间派生：active 且 `lastHeartbeatAt >= now()-150s` 为 online；
  active 但无/过期心跳为 offline；revoked 永远优先。
- Heartbeat body 不接收 client/account ID 或客户端时间。Token principal 决定设备，数据库
  接收时间推进 `lastHeartbeatAt`。
- Heartbeat 使用单条条件 UPDATE，`WHERE id=? AND status='active'`，时间使用
  `GREATEST` 保证单调。
- Revoke 在事务中锁定 owner 匹配的 active 设备并更新设备/Token/审计。PostgreSQL 行锁
  序列化同一设备的 heartbeat/revoke，最终状态必为 revoked。

**Rationale**: 1,000 在线客户端在 60 秒周期下平均约 17 writes/s，PostgreSQL 足够承担，
且能提供强一致撤销。`INSERT ... ON CONFLICT`/条件 UPDATE 提供原子行为；无需引入第二
presence 真相源。

**Alternatives considered**:

- Redis presence + TTL: 增加撤销一致性、缓存失效和运维复杂度，当前规模无必要。
- BullMQ 心跳任务: 每次心跳是短写操作，不是重活。
- 定时任务批量把 online 改 offline: 派生状态更简单准确，避免状态扫描和抖动。

## Decision 5 — Schema 定义收敛并保持真实 FK

**Decision**: 将当前 API-local、纯 Drizzle 的 `auth.ts` 原样移动到
`packages/backend-core/src/database/schema/auth.ts`，API schema barrel 继续重导出；
然后在 backend-core 定义 `device_clients`、device grants、Refresh Token，并让
`oauth_access_tokens.deviceClientId` 建立真实 FK。同步 Drizzle 显式文件清单。

迁移生成后必须确认“移动 auth schema”没有产生 drop/recreate/rename SQL，仅生成新表、
新列、约束和索引。

**Rationale**: Operational schema 已以 backend-core 为唯一真相源。若 user 表留 API-local
而 device/token 在 shared package，会形成反向包依赖；复制 user 表或用无 FK 的 UUID 都
破坏单一真相源和数据完整性。

**Alternatives considered**:

- device 表 API-local、token 表 shared: 无法在不循环依赖时声明真实 FK。
- 把全部 OAuth 表移回 API-local: 逆转仓库已完成的 schema 收敛且影响 worker/shared
  约定，拒绝。
- 不建 FK: 删除用户或设备后会留下孤儿 Token，拒绝。

## Decision 6 — API 边界与账户隔离

**Decision**:

- Web 账户端使用 better-auth `AuthGuard` 和 `CurrentUser.id`：
  `GET/PATCH/POST revoke /api/account/clients...` 及授权预览/批准/拒绝。
- Device authorization start 和 Token exchange 位于 `/api/open/v1/auth/*`；
  Heartbeat 位于 `/api/open/v1/device-clients/heartbeat`。
- Token endpoint 的 request schema 改为 Zod discriminated union，兼容现有
  `client_credentials` 并增加 device-code 与 refresh-token grant。
- AccessTokenGuard 输出 discriminated `RequestPrincipal`。所有 open API 对 device
  principal 同时验证 Token 有效及设备 active；heartbeat 只接受 device principal。
- rename/revoke repository 查询始终把 owner user ID 放入 WHERE；跨账户目标统一 404，
  body 永不接收 owner/account ID。

**Rationale**: 账户身份只能来自服务端验证的 Web session，设备身份只能来自 Token
principal。这样避免 IDOR、账户枚举及客户端伪造归属。

**Alternatives considered**:

- 复用 `/api/admin/oauth-clients`: 语义和权限范围错误。
- 由 Web body 传 accountId: 形成越权输入面，拒绝。
- 只在 heartbeat 检查 revoked: 设备仍能访问频道/播放接口，违反即时撤销。

## Decision 7 — TV 生命周期与退避

**Decision**: `MagiTvApp` 通过 `AppContainer` 启动唯一
`ClientHeartbeatCoordinator`：

- 使用 `ProcessLifecycleOwner` 感知整个进程前后台；ON_START 和网络恢复立即 single-flight
  心跳，成功后每 60 秒一次；ON_STOP 取消 timer 与在途请求。
- `ConnectivityManager` 只提供 connectivity port；无网络时等待 callback，不盲轮询。
- 网络/timeout/5xx 使用 full-jitter
  `random(0, min(5min, 5s*2^attempt))`；429 优先遵守 `Retry-After`。
- 普通请求/心跳首次 401 只 refresh 并重放一次。`invalid_grant`、revoked、refresh replay
  或重放后仍 401/403 清除凭据、停止心跳并进入 `RequiresAuthorization`。
- Coordinator、repository、TokenManager 均不引用播放器；换台不能增加心跳或改变设备 ID。

**Rationale**: Application scope 保证单 loop；ViewModel、Activity 或 Composable 重建都可能
制造重复任务。Android 官方将 `ProcessLifecycleOwner` 用于无需毫秒精度的进程前后台感知。
WorkManager 的周期模型不适合 60 秒前台心跳。

**Alternatives considered**:

- `LivePlaybackViewModel`/`LaunchedEffect` 中循环: 生命周期错误且耦合播放。
- 后台 Service 或 WorkManager: 不符合“在线代表前台运行”且增加耗电/系统限制。
- 固定退避或无 jitter: 大量 TV 同时恢复时产生请求群聚。

## Decision 8 — TV 凭据存储与迁移

**Decision**:

- domain 定义 `ClientCredentialStore` port；platform 使用 Android Keystore 生成不可导出
  AES-256-GCM key，Preferences DataStore 原子保存 `{schemaVersion, iv, ciphertext}`。
- 密文包含 device client identity、当前 rotating Refresh Token 与 family/generation；
  Access Token 只在内存。
- credential DataStore 排除 Auto Backup；Keystore key 丢失、密文被篡改或恢复到新设备时，
  清理不可解密 blob 并进入 `Unregistered`。
- 发布采用限时三阶段迁移：服务端临时并行支持旧 client_credentials；新版 TV 无新凭据时
  显式配对；达到截止日期后撤销共享 `magi_tv_android`，删除
  `OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET` BuildConfig。

**Rationale**: 现有 APK 没有逐设备秘密和账户归属，不可能安全“无感拆分”。显式重新授权
是诚实且可审计的迁移。Keystore + DataStore 满足项目宪法和长期凭据保护。

**Alternatives considered**:

- 永久保留共享凭据: 永远无法提供可信逐设备撤销。
- 把旧共享 secret 搬入加密存储: 只改变存放位置，不改变共享身份。
- 备份密文: 新设备没有原 Keystore key，恢复后不可解密且会产生幽灵客户端。

## Decision 9 — Web 路由、状态与 antd v6

**Decision**:

- 在 `APP_MENU_ROUTE` 增加 `account` 顶级 section；`/dashboard/account/clients` 激活账户
  分区并在左侧显示“客户端管理”。不要放进右上角当前仅含退出登录的 Dropdown。
- 保留“开放接口 → 客户端凭证”及 `/dashboard/oauth-clients`，严格区分 OAuth 软件凭证。
- 账户页面使用 `PageHeader + ProTableWrapper`，展示名称、非敏感设备摘要、平台/版本、
  注册/最后活跃和文字状态 Tag；不显示 Secret、Token、完整 IP 或播放信息。
- 可见页面每 10 秒刷新并在窗口聚焦时刷新；后台刷新失败保留旧数据并显示数据时间。
- 重命名使用受控 Modal + Form；撤销使用受控 danger Modal，明确终态影响并防重复提交。
  已撤销行不再显示操作。
- 实现前通过 antd CLI 查询 Table/Modal/Form/Empty/Alert/Tag/Input/Button，并使用
  `destroyOnHidden`、`mask={{ closable: false }}`，不复制已有页面的 deprecated
  `maskClosable`。

**Rationale**: 现有 ProLayout 是“顶栏分区 + 左侧子菜单”，该落点最符合用户描述并保持导航
单一数据源。10 秒轮询满足在线可见性目标，同时避免引入 WebSocket。

**Alternatives considered**:

- `/dashboard/clients`: 与 OAuth client 容易混淆。
- 复用 oauth-clients 页面: 权限、字段和危险操作语义不同。
- WebSocket/SSE presence: 当前账户设备量很小，轮询更简单可维护。

## Decision 10 — 审计、日志与隐私

**Decision**:

- 审计动作：`device_client.registered`、`device_client.renamed`、
  `device_client.revoked`、限频的 `device_client.revoked_access_rejected`。
- 成功 heartbeat 不逐次写 audit；只记录低噪声结构化 debug/指标。临时失败由 TV 本地分类，
  服务端 5xx 走结构化 error。
- 所有生命周期日志/审计带 `requestId` 和非敏感 device ID；严禁 bearer、Refresh Token、
  device_code/user_code、verification_uri_complete、完整 IP 或播放地址。
- 不采集位置、观看历史、当前播放或硬件广告标识。

**Rationale**: 满足宪法可观测性，同时避免每分钟每设备的审计噪声和秘密泄露。

**Alternatives considered**:

- 每个成功心跳写审计: 17 writes/s 的审计噪声没有安全价值。
- 记录完整 IP/UA 作为设备摘要: 与规格隐私最小化冲突。

## Resolved Unknowns

| Unknown                           | Resolution                                                      |
| --------------------------------- | --------------------------------------------------------------- |
| 客户端是 OAuth 应用还是设备？     | 新 `device_client` 是账户设备；`oauth_client` 保持软件注册。    |
| TV 如何绑定账户？                 | 首次启动自动登记到配置的默认账户；RFC 8628 仅兼容旧客户端。      |
| TV 长期凭据是什么？               | 旋转 Refresh Token，Keystore + DataStore 加密。                 |
| 在线状态保存还是派生？            | PostgreSQL 接收时间派生，不保存 online/offline。                |
| 撤销如何即时生效？                | 单事务撤销设备、Access Token、Refresh family 与审计。           |
| 心跳在哪个 TV 生命周期运行？      | Application 级前台 coordinator；后台停止。                      |
| 是否需要 Redis/BullMQ/WebSocket？ | 不需要；PostgreSQL + 10 秒 Web 轮询满足规模与 SLA。             |
| 旧共享 APK secret 如何迁移？      | 限时双轨 + 新版显式授权 + 截止后撤销和删除 BuildConfig secret。 |
