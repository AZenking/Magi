# Implementation Plan: 客户端管理与心跳

**Branch**: `007-client-management-heartbeat` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-client-management-heartbeat/spec.md`

**Deployment update**: TV 首次启动采用服务端默认账户自动登记（稳定安装标识 + 轮换凭据），不再显示授权码或要求 Web 批准；RFC 8628 端点仅保留兼容旧客户端。以下目录和阶段描述中的“授权流程”均按此默认登记实现解释。

## Summary

为 MAGI 增加账户所属的设备客户端管理、在线状态与 Android TV 心跳。实现采用独立
`device_clients` 领域表达“一次安装实例”，保留 `oauth_clients` 表达 OAuth 软件客户端；
Android TV 首次启动通过稳定安装标识自动归属配置的默认账户，获得短期 Access Token 和
旋转 Refresh Token。Web 在新的“账户 → 客户端管理”左侧菜单中提供列表、重命名和终态
撤销，不展示授权码绑定入口。心跳由 TV 进程级前台协调器每 60 秒发送，服务端以
接收时间和 150 秒窗口派生在线状态。撤销在单个 PostgreSQL 事务中终结设备及其所有 Token，
保证撤销与并发心跳竞态下撤销永远优先。

## Technical Context

**Language/Version**: TypeScript 5.8（Node.js ≥20）；Kotlin 2.0.21 / JVM 17

**Primary Dependencies**: NestJS 11、Drizzle ORM 0.45、Zod（`@magi/types` 单一契约源）、
better-auth 1.6、TanStack Start/Router/Query、React 19、antd 6、Retrofit 2.11、
OkHttp 4.12、kotlinx.serialization 1.7、Coroutines 1.9、Android Lifecycle 2.8、
Preferences DataStore 1.1、Android Keystore

**Storage**: PostgreSQL（设备、授权挑战、Access/Refresh Token、审计）；Android
Keystore + Preferences DataStore（TV 长期 Refresh Token 与设备身份密文）；Access
Token 仅保存在 TV 内存

**Testing**: Vitest 4（domain/application/repository/controller/Web）；JUnit 4 +
kotlin-test、coroutines-test、MockWebServer、Compose UI tests（TV）；PostgreSQL
集成与并发竞态测试；OpenAPI/Kotlin 契约测试；模拟器及真实遥控器设备验收

**Target Platform**: Linux API/Web 服务、现代桌面浏览器、Android TV 9+（API 28；
minSdk 23、target/compileSdk 35）

**Project Type**: Monorepo Web + modular monolith API + Android TV 客户端

**Performance Goals**:

- 1,000 个在线客户端按 60 秒周期约产生 17 次心跳/秒，持续处理无请求堆积。
- 10,000 个已注册客户端规模下，账户客户端列表 P95 ≤2 秒。
- 前台启动或网络恢复后 95% 的客户端 ≤10 秒显示在线。
- 撤销完成后 ≤5 秒拒绝该设备全部受保护操作。

**Constraints**:

- 在线状态只由数据库当前时间与服务端接收时间派生；不得信任 TV 本地时间。
- 设备撤销、Access Token 撤销、Refresh Token family 撤销与审计必须原子提交。
- 心跳不得依赖或持有 Media3；后台不保持 60 秒轮询。
- TV 长期凭据不得进入 BuildConfig、日志、诊断、截图或 Auto Backup。
- 旧共享 `magi_tv_android` Client Credentials 仅在有截止日期的迁移窗口兼容，不能
  生成设备清单或心跳；新版本必须完成一次默认账户自动登记。
- 不以 Redis presence、WebSocket 或 BullMQ 实现本期在线状态。

**Scale/Scope**: 10,000 个注册设备、1,000 个同时在线设备；一个新的账户管理页面和一个
兼容旧书签的授权 URL；4 个账户 API 操作、自动注册/兼容授权/Token/心跳开放接口；一个
TV 自动登记流程和一个进程级心跳协调器

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle / Gate               | Result | Design Evidence                                                                                                                                             |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Clean Architecture          | PASS   | Controller 只校验/塑形；UseCase 负责所有权和状态编排；domain 定义状态与 ports；Drizzle、Retrofit、Keystore、Lifecycle 均留在 infrastructure/data/platform。 |
| II. Monorepo / Shared Packages | PASS   | TypeScript DTO 与 Zod schema 只在 `packages/types`；Operational Drizzle schema 收敛到 `packages/backend-core`；TV 只通过 OpenAPI 协作。                     |
| III. Domain Independence       | PASS   | `device-client` domain 不导入 NestJS/Drizzle；TV domain 不导入 Android/Compose/Retrofit/DataStore/Media3。                                                  |
| IV. Heavy Work Async           | PASS   | 心跳、配对轮询和撤销均为短事务；不满足重活条件，因此不引入 BullMQ。                                                                                         |
| V. Contract & Type Safety      | PASS   | Token grant 使用 Zod discriminated union；API/Web 共享推导类型；OpenAPI 覆盖新开放接口，TV 用契约测试验证字段、可空性与枚举。                               |
| VI. Maintainability / YAGNI    | PASS   | 复用现有 stateful Access Token、AuthGuard、审计、request-id 与页面组件；不引入 Redis presence、推送、远程控制或硬件指纹。                                   |
| VII. Observability             | PASS   | 所有请求透传 `x-request-id`；注册/重命名/撤销进入结构化审计；成功心跳不逐次审计，拒绝事件限频去噪；秘密统一脱敏。                                           |
| Schema / Migration Gate        | PASS   | `auth.ts` 只移动 schema 定义不改表；新表和 FK 通过 Drizzle 迁移生成并审阅，禁止复制 user 表或裸 UUID 假关联。                                               |
| antd v6 Gate                   | PASS   | 实现前必须执行 `antd design.md`、组件 info/demo；只用 token/语义样式；完成后执行 `antd lint`。                                                              |

### Android TV Gate

- **Layering — PASS**: `ClientSessionRepository`、`ClientCredentialStore`、
  `ConnectivityMonitor` 是 domain/application ports；platform coordinator 只调用
  UseCase。授权 UI/ViewModel 不直接依赖 Retrofit、DataStore 或 Lifecycle。
- **Contract — PASS**: 设备授权、device-code grant、refresh grant 与心跳写入
  `/api/open.json`；`OpenApiContractTest` 校验 Kotlin DTO 的字段、可空性、枚举和错误码。
- **Focus map — PASS**: TV 授权页初始焦点、短码/URI、重新授权弹层、方向移动、关闭恢复
  与 Back 层级在 [UI contract](./contracts/ui-contract.md) 中完整定义。
- **Playback state — PASS**: 心跳 coordinator 与 session repository 不持有
  `Media3PlaybackSession`；授权失效仅通过顶层 session state 阻止受保护播放，不改变
  播放器单一所有者及换台序列规则。
- **Recovery — PASS**: 明确区分 pending、slow_down、denied、expired、offline、
  429、5xx、invalid_grant、revoked 和重复 401/403；临时错误退避，终态错误只允许显式
  重新授权。
- **10-foot UI — PASS**: 正文 ≥16sp、辅助文字 ≥14sp、目标 ≥48dp、TV 安全区、
  焦点不只依赖颜色；QR 只能辅助，短码与 URI 必须可用 D-pad 流程完成。
- **Validation — PASS**: 纯 domain、data/HTTP、加密存储、Compose UI、OpenAPI
  契约测试齐备，并安排模拟器和至少一台真实遥控器设备验收。

### Post-Design Re-check

Phase 1 数据模型和契约复核后全部门禁仍为 PASS，无未解释的宪法违反。现有
`LivePlaybackViewModel` 直依赖 `Context`/data 的历史债务不在本功能内扩大；新 session
和心跳链路完全遵循新边界。

## Project Structure

### Documentation (this feature)

```text
specs/007-client-management-heartbeat/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── ui-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # /speckit-tasks 生成，本命令不创建
```

### Source Code (repository root)

```text
packages/types/src/
├── dto/device-client.ts             # Zod request/query/VO/token grant schemas
└── index.ts                         # 公共导出

packages/backend-core/src/database/schema/
├── auth.ts                          # 从 API-local 原样收敛，表结构不变
├── oauth-clients.ts                 # confidential/public client kind
├── oauth-access-tokens.ts           # deviceClientId + grantType + scope
├── device-clients.ts
├── device-authorization-grants.ts
├── device-refresh-tokens.ts
└── index.ts

apps/api/
├── drizzle/                         # 生成并审阅的新迁移
└── src/
    ├── domain/device-client/
    │   ├── device-client.model.ts
    │   ├── device-client.repository.ts
    │   └── index.ts
    ├── application/device-client/
    │   ├── begin-device-authorization.use-case.ts
    │   ├── inspect-device-authorization.use-case.ts
    │   ├── decide-device-authorization.use-case.ts
    │   ├── exchange-device-code.use-case.ts
    │   ├── refresh-device-token.use-case.ts
    │   ├── record-heartbeat.use-case.ts
    │   ├── list-device-clients.use-case.ts
    │   ├── rename-device-client.use-case.ts
    │   └── revoke-device-client.use-case.ts
    ├── infrastructure/database/
    │   ├── schema/index.ts           # backend-core schema re-export
    │   ├── device-client.repository.ts
    │   └── access-token.repository.ts
    ├── shared/guards/access-token.guard.ts
    ├── http/account-client/
    │   ├── account-client.controller.ts
    │   └── account-client.module.ts
    └── http/open/
        ├── auth.controller.ts
        ├── device-heartbeat.controller.ts
        └── open.module.ts

apps/web/src/
├── components/app-menu.tsx
├── components/app-breadcrumb.tsx
├── routes/dashboard/account/clients/
│   ├── index.tsx
│   └── authorize.tsx
└── features/dashboard/account-clients/
    ├── client-list.tsx
    ├── device-authorization-form.tsx
    └── client-list.test.tsx

apps/tv/app/src/
├── main/kotlin/com/magi/tv/
│   ├── domain/model/ClientSession.kt
│   ├── domain/repository/ClientSessionRepository.kt
│   ├── domain/repository/ClientCredentialStore.kt
│   ├── domain/usecase/ClientSessionUseCases.kt
│   ├── data/remote/ClientApi.kt
│   ├── data/remote/ClientDtos.kt
│   ├── data/repository/DefaultClientSessionRepository.kt
│   ├── data/auth/TokenManager.kt
│   ├── data/remote/MagiClient.kt
│   ├── platform/security/KeystoreClientCredentialStore.kt
│   ├── platform/network/AndroidConnectivityMonitor.kt
│   ├── platform/lifecycle/ClientHeartbeatCoordinator.kt
│   ├── ui/auth/ClientAuthorizationViewModel.kt
│   ├── ui/auth/ClientAuthorizationScreen.kt
│   ├── ui/TvApp.kt
│   ├── di/AppContainer.kt
│   └── MagiTvApp.kt
├── test/kotlin/com/magi/tv/
│   ├── domain/usecase/ClientSessionUseCasesTest.kt
│   ├── data/auth/TokenManagerTest.kt
│   ├── data/repository/DefaultClientSessionRepositoryTest.kt
│   └── data/remote/OpenApiContractTest.kt
└── androidTest/kotlin/com/magi/tv/
    ├── platform/security/KeystoreClientCredentialStoreTest.kt
    └── ui/auth/ClientAuthorizationScreenTest.kt
```

**Structure Decision**: 以 `device-client` 作为新的业务领域，避免和已有 OAuth 应用凭证
混名；数据定义收敛到 `backend-core` 以建立真实 user/device/token FK。Web route 保持薄层，
复杂交互位于 feature 目录。TV session 是独立纵向切片，application 级 coordinator 与
播放器完全分离。

## Delivery Phases

### Phase A — Contract and schema foundation

1. 先在 `packages/types` 定义 Zod discriminated union 与 VO，再更新 OpenAPI。
2. 将纯 Drizzle `auth.ts` 原样移动到 backend-core 并保持 API barrel 重导出。
3. 添加 device/grant/refresh schema，扩展 OAuth client/token schema，生成并审阅迁移。
4. 先写领域状态、token rotation、所有权和 PostgreSQL 竞态失败测试。

### Phase B — API lifecycle

1. 实现设备授权开始、Web 预览/批准/拒绝、device-code exchange 和 refresh rotation。
2. 实现 heartbeat 条件更新、账户列表派生状态、重命名与事务撤销。
3. 扩展 AccessTokenGuard 为 integration/device principal，并让全部 open API 在设备
   principal 上检查设备仍 active。
4. 接入 request-id、审计/去噪、限流和 OpenAPI contract tests。

### Phase C — Web account management

1. 按 antd CLI 流程确认 Table/Modal/Form/Popconfirm/Result/Tag 用法。
2. 新增“账户”导航 section 与客户端列表/授权 route。
3. 实现 10 秒可见时自动刷新、稳定分页、重命名、撤销确认和授权短码预览。
4. 覆盖 loading/empty/error/stale、跨账户不可见及 mutation cache invalidation。

### Phase D — TV authorization and heartbeat

1. 先实现 domain session state、ports 与虚拟时钟/随机源测试。
2. 实现默认账户自动登记、refresh rotation、Keystore + DataStore 和 auth error 分类；保留
   RFC 8628 轮询接口供旧版本兼容。
3. 在 Application composition root 启动唯一前台 coordinator；处理 connectivity、
   full-jitter backoff、single-flight 与 generation 防旧回调。
4. 实现自动登记失败/撤销提示与焦点/Back 恢复，不修改播放器 owner。
5. 删除共享 secret BuildConfig 路径；按发布配置完成 legacy client 的限时迁移和撤销。

### Phase E — Verification and rollout

1. 运行 TypeScript、API/Web、Gradle、OpenAPI 和并发竞态门禁。
2. 按 [quickstart](./quickstart.md) 完成双账户、配对、在线/离线、重命名、撤销和秘密扫描。
3. 在模拟器与真实遥控器设备记录断网、恢复、401、撤销、重新授权、快速换台结果。
4. 观测迁移窗口内 legacy 使用量；达到截止日期后撤销旧共享 OAuth client。

## Complexity Tracking

无宪法违反需要豁免。新增设备授权和 Refresh Token rotation 是修复当前共享 APK secret
无法建立账户设备身份的必要安全边界，不是为假想需求引入的抽象。
