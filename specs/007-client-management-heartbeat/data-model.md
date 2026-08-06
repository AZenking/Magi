# Data Model: 客户端管理与心跳

**Date**: 2026-07-31
**Feature**: [spec.md](./spec.md)
**Research**: [research.md](./research.md)

## Model Boundaries

```text
user (better-auth account owner)
  └──< device_clients (one TV/app installation)
          ├──< oauth_access_tokens (short-lived, device-bound)
          ├──< device_refresh_tokens (rotating family)
          └──< audit_events (logical target, no secret)

oauth_clients (software registration)
  ├──< device_authorization_grants (pending TV pairing)
  ├──< device_clients
  └──< oauth_access_tokens
```

`oauth_clients` 回答“哪个软件/集成访问”；`device_clients` 回答“哪个账户下的哪次安装访问”。
这两个概念不得在 DTO、路由或 UI 中混名。

## Entity: User

沿用 better-auth `user` 表，字段不变。本功能只使用：

| Field   | Type | Rules                                    |
| ------- | ---- | ---------------------------------------- |
| `id`    | text | PK；设备 owner 与撤销操作者的权威账户 ID |
| `name`  | text | Web 授权确认显示，不复制到设备记录       |
| `email` | text | 不进入设备 API 或心跳日志                |

### Schema ownership change

`auth.ts` 的 Drizzle 定义从 API-local 原样移动到 backend-core，以便 device/token 表建立真实
FK。该移动不得产生数据库 DDL；迁移审阅若出现 user/account/session drop/recreate 必须停止。

## Entity: OAuth Client

现有 `oauth_clients` 保留软件客户端语义并扩展 public client 支持。

| Field          | Type         | Required    | Rules                                                        |
| -------------- | ------------ | ----------- | ------------------------------------------------------------ |
| `id`           | uuid         | yes         | PK                                                           |
| `clientId`     | varchar(64)  | yes         | 全局唯一公开标识                                             |
| `clientName`   | varchar(120) | yes         | 软件/集成名称                                                |
| `clientKind`   | varchar(20)  | yes         | `confidential` 或 `public_device`；既有行回填 `confidential` |
| `secretHash`   | varchar(64)  | conditional | confidential 必填；public_device 必须为空                    |
| `secretPrefix` | varchar(12)  | conditional | confidential 必填；public_device 必须为空                    |
| `status`       | varchar(20)  | yes         | `active`、`disabled`、`revoked`                              |
| `lastUsedAt`   | timestamptz  | no          | 软件客户端最近成功使用时间；不作为设备在线状态               |
| `createdBy`    | text         | yes         | 既有审计字段；不是 device owner 的替代                       |
| `version`      | integer      | yes         | optimistic version                                           |
| timestamps     | timestamptz  | yes         | 既有 created/updated                                         |

### Invariants

- `clientKind=public_device` 不允许 Client Credentials Grant。
- Device Authorization Grant 只接受 active public_device client。
- 原“开放接口 → 客户端凭证”页面只管理 confidential rows。
- 旧共享 `magi_tv_android` 在迁移窗口保持 confidential；新建独立 public client
  `magi_tv`（具体 ID 由部署配置确定），迁移截止后撤销旧行。

## Entity: Device Client

表名 `device_clients`；用户界面称“客户端”。

| Field             | Type         | Required    | Rules                                                            |
| ----------------- | ------------ | ----------- | ---------------------------------------------------------------- |
| `id`              | uuid         | yes         | 随机 PK，也是非敏感稳定客户端 ID                                 |
| `ownerUserId`     | text         | yes         | FK `user.id` ON DELETE CASCADE                                   |
| `oauthClientId`   | uuid         | yes         | FK `oauth_clients.id` ON DELETE RESTRICT；必须指向 public_device |
| `displayName`     | varchar(64)  | yes         | trim 后 1–64 个可显示 Unicode 字符；重复允许                     |
| `deviceType`      | varchar(32)  | yes         | 首期 `android_tv`；由共享 enum 管理                              |
| `platform`        | varchar(32)  | yes         | 首期 `android`                                                   |
| `platformVersion` | varchar(64)  | yes         | 非敏感系统版本摘要                                               |
| `appVersion`      | varchar(64)  | yes         | 授权时写入，成功心跳可更新                                       |
| `identitySummary` | varchar(120) | yes         | 人可识别、非敏感摘要；禁止 MAC/完整 IP/广告 ID                   |
| `status`          | varchar(16)  | yes         | 持久状态 `active` 或 `revoked`                                   |
| `registeredAt`    | timestamptz  | yes         | 服务端注册时间                                                   |
| `lastHeartbeatAt` | timestamptz  | no          | 最近成功心跳的服务端接收时间                                     |
| `revokedAt`       | timestamptz  | conditional | revoked 必填                                                     |
| `revokedBy`       | text         | conditional | FK `user.id`；revoked 必填                                       |
| `version`         | integer      | yes         | 初始 1；rename/revoke 递增                                       |
| timestamps        | timestamptz  | yes         | created/updated                                                  |

### Database constraints

- `status='active'` ⇒ `revokedAt IS NULL AND revokedBy IS NULL`
- `status='revoked'` ⇒ `revokedAt IS NOT NULL AND revokedBy IS NOT NULL`
- `oauthClientId` 对应行必须为 `public_device`；跨表条件由消费 UseCase/Repository 验证。
- 不对设备型号、摘要、网络地址或硬件指纹做唯一约束。

### Indexes

1. `(ownerUserId, status, lastHeartbeatAt DESC, id)`：账户列表与稳定分页。
2. `(oauthClientId)`：按 software client 统计/迁移。
3. `(id, status)`：heartbeat/revoke 条件更新热路径（PK 已覆盖 id，是否保留复合索引由
   `EXPLAIN` 决定，不盲目添加）。

### Derived presence

以同一个数据库 `now` 参数计算：

```text
if status = revoked                                  => revoked
else if lastHeartbeatAt != null
        and lastHeartbeatAt >= dbNow - 150 seconds   => online
else                                                 => offline
```

排序：

```text
online → offline → revoked
then lastHeartbeatAt DESC NULLS LAST
then id ASC
```

online/offline 不持久化，不需要离线扫描任务。

### State transitions

```text
active ──revoke(owner)──> revoked (terminal)
```

- rename 不改变状态，`version + 1`。
- heartbeat 只允许 active；不改变 `version`，只单调推进 `lastHeartbeatAt` 和允许更新
  `appVersion/platformVersion`。
- revoked 不允许 enable/restore；设备必须走新授权并创建新的 Device Client。

## Entity: Device Authorization Grant

表名 `device_authorization_grants`，表示短期 RFC 8628 challenge。

| Field                  | Type         | Required    | Rules                                              |
| ---------------------- | ------------ | ----------- | -------------------------------------------------- |
| `id`                   | uuid         | yes         | PK                                                 |
| `oauthClientId`        | uuid         | yes         | FK active public_device OAuth client               |
| `deviceCodeHash`       | varchar(64)  | yes         | 高熵 device_code SHA-256，唯一                     |
| `userCodeDigest`       | varchar(64)  | yes         | 规范化 user_code 的 HMAC-SHA256，唯一              |
| `deviceType`           | varchar(32)  | yes         | 待注册元数据                                       |
| `platform`             | varchar(32)  | yes         | 待注册元数据                                       |
| `platformVersion`      | varchar(64)  | yes         | 待注册元数据                                       |
| `appVersion`           | varchar(64)  | yes         | 待注册元数据                                       |
| `identitySummary`      | varchar(120) | yes         | Web 批准前展示                                     |
| `requestedDisplayName` | varchar(64)  | no          | TV 建议名；用户批准时可覆盖                        |
| `status`               | varchar(16)  | yes         | `pending`,`approved`,`denied`,`consumed`,`expired` |
| `ownerUserId`          | text         | conditional | approved/consumed/denied 时的 Web 用户             |
| `approvedDisplayName`  | varchar(64)  | conditional | approved/consumed 必填                             |
| `expiresAt`            | timestamptz  | yes         | 默认创建后 10 分钟                                 |
| `pollIntervalSeconds`  | integer      | yes         | 初始 5；slow_down 后服务端可推进                   |
| `lastPolledAt`         | timestamptz  | no          | 服务端执行轮询节流                                 |
| `approvedAt`           | timestamptz  | no          | approved 时间                                      |
| `consumedAt`           | timestamptz  | no          | Token 成功签发时间                                 |
| `deviceClientId`       | uuid         | no          | consumed 后 FK 新 device client，唯一              |
| `version`              | integer      | yes         | 并发批准/消费 guard                                |
| timestamps             | timestamptz  | yes         | created/updated                                    |

### Code rules

- `device_code`: 至少 256-bit 随机，明文仅返回 TV，不进入 UI/log/audit。
- `user_code`: 8 个去歧义大写字符（显示为 `XXXX-XXXX`），规范化时忽略连字符和大小写。
- 数据库存 user code keyed HMAC，不存普通 hash，避免低熵码在数据库泄露后被离线枚举。
- 预览/批准尝试按登录用户与 request context 限流；未知、过期、已消费统一为不可用。

### State transitions

```text
pending ──approve──> approved ──successful device-code exchange──> consumed
   │                    │
   ├──deny──────────> denied
   └──time──────────> expired

approved ──time before exchange──> expired
```

- approve/deny 只能命中 pending 且未过期行。
- Token exchange 锁定 approved grant，原子创建 device client、Access Token、Refresh Token，
  再标记 consumed；重试不能创建第二设备。
- pending 返回 `authorization_pending`；过快轮询返回 `slow_down` 并增加 interval。

## Entity: OAuth Access Token

沿用 `oauth_access_tokens`，新增设备归因。

| Field            | Change            | Rules                                                                          |
| ---------------- | ----------------- | ------------------------------------------------------------------------------ |
| `clientId`       | unchanged         | 始终 FK OAuth software client                                                  |
| `deviceClientId` | new nullable uuid | Device/refresh grants 必填；Client Credentials 为 null                         |
| `grantType`      | new varchar(64)   | `client_credentials`,`device_code`,`refresh_token`                             |
| `scope`          | new varchar(255)  | 空格分隔；integration 默认 `open:read`；device 为 `open:read client:heartbeat` |
| `tokenHash`      | unchanged         | SHA-256 唯一                                                                   |
| `tokenPrefix`    | unchanged         | 仅非敏感诊断                                                                   |
| `expiresAt`      | unchanged         | 默认签发后 1 小时                                                              |
| `revokedAt`      | unchanged         | 非空即无效                                                                     |

### Validity

Integration principal:

```text
token revokedAt null
AND token expiresAt > dbNow
AND oauth client active
AND deviceClientId null
```

Device principal:

```text
token revokedAt null
AND token expiresAt > dbNow
AND oauth public client active
AND device client active
AND device client belongs to token.deviceClientId
```

Guard 输出：

```text
IntegrationPrincipal { kind, oauthClientId, clientId, clientName, scope }
DevicePrincipal {
  kind, oauthClientId, clientId, clientName,
  deviceClientId, ownerUserId, scope
}
```

## Entity: Device Refresh Token

表名 `device_refresh_tokens`。

| Field            | Type        | Required | Rules                              |
| ---------------- | ----------- | -------- | ---------------------------------- |
| `id`             | uuid        | yes      | PK                                 |
| `deviceClientId` | uuid        | yes      | FK device client ON DELETE CASCADE |
| `oauthClientId`  | uuid        | yes      | FK public OAuth client             |
| `familyId`       | uuid        | yes      | 一次设备授权的 rotation family     |
| `generation`     | integer     | yes      | 从 1 递增，family 内唯一           |
| `tokenHash`      | varchar(64) | yes      | SHA-256，唯一                      |
| `tokenPrefix`    | varchar(12) | yes      | 非敏感排错前缀                     |
| `expiresAt`      | timestamptz | yes      | 每次合法 rotation 后 30 天         |
| `consumedAt`     | timestamptz | no       | rotation 后立即设置                |
| `revokedAt`      | timestamptz | no       | 设备撤销/replay family revoke      |
| `replacedById`   | uuid        | no       | 自引用下一 generation              |
| timestamps       | timestamptz | yes      | created/updated                    |

### Constraints and indexes

- UNIQUE `(familyId, generation)`
- UNIQUE `tokenHash`
- INDEX `(deviceClientId, revokedAt, expiresAt)`
- active iff `consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > dbNow`

### Rotation transaction

1. 根据 hash 锁定 Token。
2. 若已 consumed：视为 replay，撤销同 family 全部 Token 和当前 Access Token，返回
   `invalid_grant`。
3. 验证 device 与 public OAuth client active。
4. 设置旧 Token `consumedAt`，插入 generation+1 Token，将 `replacedById` 指向新 Token。
5. 插入新 Access Token。
6. 原子提交后才返回两份明文 Token。

## Entity: Audit Event

沿用 append-only `audit_events`：

| Action                                  | Actor         | Target        | Summary                                 |
| --------------------------------------- | ------------- | ------------- | --------------------------------------- |
| `device_client.registered`              | user          | device_client | type/platform/appVersion；无 code/token |
| `device_client.renamed`                 | user          | device_client | changedFields 仅含 `displayName`        |
| `device_client.revoked`                 | user          | device_client | revoked token counts                    |
| `device_client.revoked_access_rejected` | device/system | device_client | 限频计数与 requestId                    |

成功 heartbeat 不生成 AuditEvent。任何 summary 均不得包含 Token、device/user code、完整 IP、
播放地址或观看信息。

## Atomic Operations

### Record heartbeat

逻辑等价于：

```sql
UPDATE device_clients
SET last_heartbeat_at = GREATEST(
      COALESCE(last_heartbeat_at, '-infinity'::timestamptz),
      transaction_timestamp()
    ),
    app_version = :validated_app_version,
    platform_version = :validated_platform_version,
    updated_at = transaction_timestamp()
WHERE id = :principal_device_id
  AND status = 'active'
RETURNING last_heartbeat_at;
```

不执行 read-before-write；重复/并发请求保持单调。0 行更新按 principal/状态转换为统一撤销或
无效授权错误。

### Revoke owned device

单事务：

1. `SELECT ... FOR UPDATE` / 条件 UPDATE 命中 `id + ownerUserId`。
2. active → revoked，设置时间/操作者/version；已 revoked 作为幂等成功。
3. revoke `oauth_access_tokens WHERE deviceClientId=? AND revokedAt IS NULL`。
4. revoke `device_refresh_tokens WHERE deviceClientId=? AND revokedAt IS NULL`。
5. append audit（或在同事务写出既有 transactional outbox，再由既有 audit writer处理）。
6. commit。

跨账户、未知 ID 统一返回 not-found。任何步骤失败全部回滚。

## Retention and Cleanup

- Device Client 与撤销记录按账户/安全审计统一保留策略保存，不自动物理删除。
- Device Authorization Grant 在业务判断上按 `expiresAt` 立即失效；consumed/denied/expired
  行可在 7 天后由低频 housekeeping 删除。
- Access Token 沿用现有过期清理。
- Refresh Token revoked/expired 行至少保留到 replay 检测窗口结束；首期保留 90 天后清理。
- 清理不改变 device client 或 append-only audit retention。

## Migration

1. 迁移 schema 定义文件位置，确认 auth 表零 DDL。
2. `oauth_clients.clientKind` 默认/回填 `confidential`；secret 列改为 nullable并加 kind/secret
   一致性 check。
3. 新建 public device OAuth client（部署 seed，不含 secret）。
4. 新建 device/grant/refresh 表；扩展 access token 列/索引。
5. API 同时支持旧 integration Client Credentials 与新 device flow。
6. TV 新版本完成显式授权后不再读取共享 Client Secret。
7. 迁移截止后 revoke 旧 TV confidential client 及其 Access Token；后续版本删除相应
   BuildConfig 字段。
