# Quickstart Validation: 客户端管理与心跳

**Purpose**: 在实现完成后验证账户隔离、TV 自动登记、心跳、在线状态、重命名、撤销和恢复。
**Contracts**: [OpenAPI](./contracts/openapi.yaml) · [UI Contract](./contracts/ui-contract.md)
**Data Model**: [data-model.md](./data-model.md)

## 1. Prerequisites

- Node.js ≥20、pnpm 10、Docker/Docker Compose。
- JDK 17+、Android SDK 35、Android TV 模拟器。
- 至少一台带真实遥控器的 Android TV 设备用于最终验收。
- 两个测试账户 A/B；账户 A 用于配对，账户 B 用于越权验证。
- 测试日志级别不得输出 Authorization、Token、device/user code 或完整播放地址。

确认当前 feature：

```bash
cat .specify/feature.json
```

预期：

```json
{ "feature_directory": "specs/007-client-management-heartbeat" }
```

格式空白可不同。

## 2. Start Infrastructure and Apply Migration

使用项目唯一官方初始化入口：

```bash
bash scripts/init-dev.sh
```

生成迁移后先审阅 SQL，再应用：

```bash
pnpm --filter @magi/api db:generate
pnpm --filter @magi/api db:migrate
```

迁移审阅硬门槛：

- 不得 drop/recreate/rename better-auth 的 `user`、`session`、`account`、`verification`。
- 既有 `oauth_clients` 全部回填 `clientKind=confidential`。
- 新 device/grant/refresh 表具有真实 FK、唯一约束与规定索引。
- `oauth_access_tokens.deviceClientId` 对既有行保持 null，不改变旧 Token 语义。
- `user.role` 默认 `user`，部署种子账户同步为 `admin`；OAuth 客户端管理接口必须通过管理员角色。

## 3. Contract and Type Validation

先验证共享类型、API 与 OpenAPI：

```bash
pnpm --filter @magi/types build
pnpm --filter @magi/types lint
pnpm --filter @magi/api test
pnpm --filter @magi/api lint
pnpm --filter @magi/api build
```

必须覆盖：

- Token Zod discriminated union 的三种 grant。
- OpenAPI 中 device authorization、token、heartbeat 字段/nullable/enum/error code。
- Cross-account list/rename/revoke 统一不可见。
- Device Token 在全部 open API hot path 检查 device active。

## 4. PostgreSQL Concurrency Validation

运行 device repository 集成测试：

```bash
pnpm --filter @magi/api test -- device-client
```

验收断言：

1. 100 个并发/重复 heartbeat 不创建重复设备，`lastHeartbeatAt` 不倒退。
2. 100 个 heartbeat 与 revoke 并发时，最终 100% 为 revoked。
3. Revoke 成功时设备、Access Token、Refresh family 与审计同时提交。
4. 任一步注入失败时全部回滚。
5. 150 秒边界：等于阈值为 online，超过阈值为 offline；revoked 永远优先。
6. 10,000 clients/1,000 online fixture 下列表 P95 ≤2 秒，稳定排序无跨页重复/遗漏。

## 5. Web Validation

实现 antd UI 前确认当前 v6 组件契约：

```bash
antd design.md --format json
antd info Table --format json --version 6.x
antd info Modal --format json --version 6.x
antd info Form --format json --version 6.x
antd demo Table basic --format json
antd demo Modal basic --format json
```

运行 Web 门禁：

```bash
pnpm --filter @magi/web test
pnpm --filter @magi/web lint
pnpm --filter @magi/web lint:antd
pnpm --filter @magi/web build
```

手动检查账户 A：

1. 顶栏选择“账户”，左侧出现并选中“客户端管理”。
2. `/dashboard/account/clients` 的 loading、empty、error、stale 状态符合 UI contract。
3. `/dashboard/oauth-clients` 仍属于“开放接口 → 客户端凭证”，没有设备在线字段。
4. 客户端表不出现 Secret、Token、完整 IP、播放地址或观看信息。
5. 重命名 trim 后保存；空白、>64 字符、控制字符被拒绝；重复名称允许。
6. 撤销 Modal 明确终态影响；取消不请求；pending 防双击；失败不关闭上下文；撤销行可
   “允许重新登记”，成功后设备下次登记会轮换凭证。
7. 客户端详情显示平台、版本、最后心跳、在线窗口和撤销时间；搜索和状态筛选不改变账户隔离。
8. icon-only 操作有 aria-label；状态 Tag 有文字；关闭 Modal 后焦点回触发按钮。

## 6. Device Authorization End-to-End

启动 API/Web：

```bash
pnpm dev
```

安装并启动没有设备凭据的新 TV build。预期 TV 不显示授权码或验证 URI，而是：

- 生成并持久化安装标识；
- 自动调用 `POST /api/open/v1/auth/device-register`；
- 注册成功后保存加密刷新凭据并进入播放器；
- 不显示 device_code、Client Secret 或 Access/Refresh Token。

在默认账户 A 的 Web：

1. 进入“账户 → 客户端管理”。
2. 刷新后看到自动登记的电视，核对设备摘要、平台和版本。
3. 可设置名称“客厅电视”；账户 B 列表不可见，猜测 UUID 的详情/修改/撤销也统一返回
   not-found。

重复验证：

- 相同安装标识重复注册只复用一个 device client，不创建重复记录。
- 网络恢复或前台恢复后 TV 立即发送一次 heartbeat。
- RFC 8628 授权码接口仅用于旧版本兼容，不作为默认验收步骤。

## 7. Heartbeat and Presence

保持 TV 前台、网络正常：

1. 自动注册成功或 ON_START 后立即发送一次 heartbeat。
2. 后续成功间隔从上次完成时刻计算，约 60 秒。
3. Web 可见页面在 10 秒刷新周期内显示 online，`lastActiveAt` 单调推进。
4. 连续快速换台不会产生额外 heartbeat，device client ID 不变。

将 TV 退到后台：

1. 在途 heartbeat 和 timer 被取消，后台无 60 秒请求。
2. 最后成功 heartbeat 后超过 150 秒，API 派生 offline。
3. Web 最迟在规格允许的 180 秒内显示 offline，并保留最后活跃时间。

恢复前台：

1. single-flight 立即 heartbeat。
2. 网络正常时 ≤10 秒重新显示 online。
3. Activity 重建/配置变化不创建第二 coordinator 或第二 loop。

## 8. Network, Rate Limit, and Token Rotation

按顺序模拟：

| Scenario                       | Expected                                       |
| ------------------------------ | ---------------------------------------------- |
| 断网                           | 停止请求，保留凭据，等待 connectivity callback |
| 恢复网络                       | 合并为一次立即 heartbeat                       |
| timeout/5xx                    | full-jitter 指数退避，最大 5 分钟              |
| 429                            | 遵守 Retry-After 并加小扰动                    |
| Access Token 过期/首次 401     | Mutex 下只 refresh 一次，只重放一次            |
| 并发 N 个请求遇到过期          | 只产生一次 Refresh Token rotation              |
| 重用已消费 Refresh Token       | 撤销整个 family，进入重新授权                  |
| refresh 网络失败               | 保留长期凭据，不误判撤销                       |
| invalid_grant/repeated 401/403 | 清凭据、停止 heartbeat、RequiresAuthorization  |

检查 DataStore：

- 只有 `{schemaVersion, iv, ciphertext}`，无明文 Token。
- Access Token 不落盘。
- Auto Backup 排除 credential 文件。
- 篡改密文、删除 Keystore key 或把备份 blob 放入新设备时，应用清理并安全进入
  Unregistered，不崩溃、不猜测原身份。

## 9. Revoke End-to-End

在账户 A 撤销在线“客厅电视”：

1. API 返回 revoked client 和撤销的 Access/Refresh Token 数量。
2. 5 秒内，该设备的 heartbeat、频道、节目单和播放决策请求全部被拒绝。
3. 并发 heartbeat 不得让状态恢复 online 或推进已撤销记录。
4. TV 最多完成一次 refresh/replay，随后清除凭据、停止 heartbeat，显示
   `设备访问已撤销`。
5. 只使用 D-pad/OK/Back 可进入重新授权或返回安全的未授权页面。
6. 原 client 继续显示 revoked；账户所有者可在 Web 使用“允许重新登记”解除撤销，TV
   下次自动登记时轮换凭证并复用同一安装记录；未解除撤销前仍不得恢复 heartbeat。
7. 账户 B 无法撤销或解除撤销该设备，也无法从差异错误推断它存在。

审计应包含注册、重命名、撤销；成功 heartbeat 不应逐次写审计。

## 10. Android TV Automated Gates

```bash
cd apps/tv
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebug
```

若实现了 instrumentation/Compose tests：

```bash
./gradlew :app:connectedDebugAndroidTest
```

必须通过的测试组：

- Client session state/use cases（虚拟时钟、随机源、generation）。
- TokenManager concurrent refresh/rotation/replay。
- Device grant problem codes 与 heartbeat retry 分类。
- OpenAPI contract compatibility。
- Keystore credential round-trip、rotation、tamper/key-loss。
- 授权页初始焦点、D-pad 全可达、Back 层级和焦点恢复。

## 11. Physical Device Acceptance Record

在至少一台真实遥控器设备记录：

| Scenario         | Emulator | Physical device | Result/notes |
| ---------------- | -------- | --------------- | ------------ |
| 首次短码授权     | 待人工执行 | 待人工执行 | 自动登记流程已由 ClientAuthorizationViewModel JVM 测试覆盖（Authorized/Failed/retry）；真机首次授权需物理验收 |
| 短码过期/拒绝    | 待人工执行 | 待人工执行 | RFC 8628 兼容路径仅用于旧版，PollResult 映射由 ClientSessionUseCasesTest 覆盖；真机需物理验收 |
| 前后台 heartbeat | JVM 测试通过 | 待人工执行 | ClientHeartbeatCoordinatorTest 验证 ON_START 立即心跳 + ON_STOP 取消；HeartbeatAcceptanceTest 验证 60s cadence |
| 断网与恢复       | JVM 测试通过 | 待人工执行 | HeartbeatAcceptanceTest 验证 network recovery coalescing（1-2 次） |
| 429/5xx 退避     | 待人工执行 | 待人工执行 | 退避逻辑由 DefaultClientSessionRepository 错误分类覆盖；真机需物理验收 |
| 401 refresh      | 待人工执行 | 待人工执行 | TokenManager INVALID_CREDENTIAL_CODES 清凭据由 JVM 测试覆盖；真机需物理验收 |
| Web 撤销         | 集成测试通过 | N/A | device-client-lifecycle.integration.test 验证原子撤销 + 拒绝后续心跳 |
| 自动重新登记     | Keystore 测试通过 | 待人工执行 | KeystoreClientCredentialStoreTest（5/5）验证加密 round-trip + clear 保留 installation_id |
| 快速连续换台     | JVM 测试通过 | 待人工执行 | HeartbeatAcceptanceTest 验证快速换台不增加心跳计数（playback-agnostic） |
| 侧栏/信息层/Back | 待人工执行 | 待人工执行 | D-pad/Back 层级需真机遥控器物理验收；Compose UI 测试 @Ignore（API 36 模拟器兼容性问题） |

仅截图或鼠标操作不算通过。

## 12. Repository-Wide Final Gates

```bash
pnpm lint
pnpm build
pnpm --filter @magi/backend-core test
pnpm --filter @magi/api test
pnpm --filter @magi/web test
```

最后执行秘密扫描（模式应覆盖项目实际 Token 前缀和测试 fixture 白名单）：

```bash
rg -n 'Authorization: Bearer|refresh_token|device_code|client_secret|https?://.*\\?.*token=' \
  .logs logs apps/api/dist apps/web/dist 2>/dev/null
```

预期生产日志/构建产物中的真实秘密命中数为 0；测试 fixture 的占位值必须人工确认。

## 13. Legacy Credential Cutover

发布记录必须给出迁移截止日期：

服务端以 `MAGI_LEGACY_DEVICE_CLIENT_ID`（默认 `magi_tv_android`）和
`MAGI_LEGACY_DEVICE_CLIENT_CUTOFF_AT`（ISO-8601 时间）控制窗口；截止后旧
Client Credentials 请求返回 `client-migration-required`，不会再签发新 Token。

1. 迁移窗口内旧 TV 可继续播放，但不能产生 heartbeat 或设备列表记录。
2. 新 TV 版本首次启动要求一次显式设备授权，成功后不再读取共享 secret。
3. 观察 legacy client 的最后使用时间和版本覆盖率。
4. 截止日 revoke 旧 `magi_tv_android` confidential client 及全部 Token。
5. 下一版本删除 `magi.clientId/magi.clientSecret` Gradle properties 和
   `OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET` BuildConfig。

永久双轨不算完成。
