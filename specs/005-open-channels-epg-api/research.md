# Research: 开放接口平台 — 频道与节目单只读 API

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29

> 本文档消化针对本特性的代码库探索结论,并锁定所有技术决策。所有决策均有据(来自 spec 约束 + 宪法 + 现有代码)。

## 决策一览

| # | 决策点 | 选择 | 依据 |
|---|---|---|---|
| D1 | 数据源 | 复用规整输出层(canonical_channels + 绑定 EPG 的 programmes) | spec Assumption + 路线图 |
| D2 | 鉴权 | 自建 `api_keys` 表 + 自建 `ApiKeyGuard`,与 better-auth session 物理隔离 | spec FR-019;better-auth 无 API key 插件 |
| D3 | 凭据存储 | SHA-256 hash + 打码前缀,不存明文 | spec FR-002 |
| D4 | 凭据模型 | 平台签发的访问密钥(管理员统一管理),不绑 user | spec Assumption |
| D5 | OpenAPI | 代码优先(`@nestjs/swagger`),自动产出 `/api/open.json` + `/api/docs` | spec FR-016/017/018 |
| D6 | DTO 真相源 | Zod(宪法 V),swagger 装饰器只管文档 | 宪法 V;双重元数据记入 Complexity |
| D7 | 限流 | 进程内内存版(首版),按 key 计数 | spec Assumption |
| D8 | 复用范围 | `FindCanonicalChannelsUseCase` + `FindOutputGuideUseCase` + `FindOutputChannelDetailUseCase` | 已验证纯 use-case |
| D9 | `/output/*` | 不动 | spec Assumption |
| D10 | 响应投影 | 只暴露产品视图字段,**绝不**含 streamUrl/sourceId/health/lifecycle | spec FR-012 |

---

## D1 — 数据源:复用规整输出层

**Decision**: 开放接口读 `canonical_channels`(归一化频道)+ 经 EPG 绑定的 `programmes`(节目单),即"对外产品视图"。

**Rationale**:
- 现有 `FindCanonicalChannelsUseCase`(`apps/api/src/application/output-composition/find-canonical-channels.use-case.ts`)是纯 `@Injectable`,只接 `FindCanonicalChannelsQuery` 返回 `{ items: CanonicalChannel[]; total }`,**完全不碰 HTTP/auth**,可直接注入新控制器。
- 同理 `FindOutputGuideUseCase`、`FindOutputChannelDetailUseCase` 也是纯 use-case。
- canonical channels 带 `shouldBeInOutput()` / `lifecycle` 语义,天然支持 FR-011(只返回对外可见频道)。
- 稳定标识 `magi:{canonicalChannelId}` 已是 V2 输出标准(FR-015)。

**Alternatives considered**:
- 读原始 `channels`/`programmes` 表 → 含上游 `streamUrl`、来源同步状态,对外既不安全也无意义,违反 FR-012。否决。
- 新建并行数据源 → 违反 YAGNI(宪法 VI)。否决。

---

## D2 — 鉴权:自建 api_keys + ApiKeyGuard

**Decision**: 新建 `api_keys` 表 + `ApiKeyGuard`(读 `Authorization: Bearer magi_xxx` 或 `x-api-key` → SHA-256 → 查表),与现有 `AuthGuard`(better-auth session cookie)**物理隔离**。

**Rationale**:
- 已确认全仓库**零** API key / Bearer / client_credentials 基础设施(grep `apiKey|api_key|access_token|x-api-key|client_id|clientId` 仅命中 backup-redactor 的脱敏正则 + better-auth 自身 OAuth account 列)。
- 现有 `AuthGuard`(`apps/api/src/shared/guards/auth.guard.ts`)只调 `auth.api.getSession({ headers })`,无 token fallback。是 `ApiKeyGuard` 的干净模板。
- better-auth 1.6 的 API key 插件把 key 绑在 user 上(每用户一把),与 spec 的"平台签发、管理员统一管理"语义不符 → 不采用插件,自建表。

**Alternatives considered**:
- better-auth `apiKey` 插件 → 语义错位(个人令牌 vs 平台凭据)。否决。
- 在现有 `/output/*` 读路由上加 key 作 AuthGuard 替代 → 改动现有路由,违反 spec Assumption(不动 /output)。否决。

---

## D3 — 凭据存储:SHA-256 hash + 打码前缀

**Decision**:
- 生成:明文 = `magi_<32 base62>`;DB 存 `sha256(明文)` 的 hex(64 字符)到 `key_hash`;存明文前 8 字符 + `…` 到 `key_prefix`(如 `magi_3f9a…`)。
- 校验:`sha256(传入)` hex 比对 `key_hash`。
- 列表/查询**永不返回明文**,只显 `key_prefix`。

**Rationale**: 业界 API key 标准做法(类 GitHub PAT)。现有 `backup-redactor.ts` 已覆盖 `token|secret|key` 脱敏,日志层一致(FR-021)。

---

## D4 — 凭据模型:平台签发,不绑 user

**Decision**: `api_keys.created_by` 记录管理员 user.id(审计用),但 key 本身不绑定到某个 end-user;`scopes` 字段预留 jsonb,首版可空。

**Rationale**: spec Assumption 明确首版不做多租户/细粒度可见性。预留 `scopes` 而不实现 = 符合 YAGNI(为第三个具体用例才实现),但留扩展点。

---

## D5/D6 — OpenAPI:代码优先 + Zod 真相源

**Decision**:
- `apps/api` 加 `@nestjs/swagger`;`OpenApiController` 每方法加 `@ApiTags/@ApiOperation/@ApiResponse`;`main.ts` 挂 `SwaggerModule.setup("api/docs", app, doc)` + 暴露 `api/open.json`。
- DTO 校验**仍用 Zod**(宪法 V),`.safeParse()` + `BadRequestException`(沿用现有控制器模式)。
- `@ApiProperty` 装饰器**只管文档生成**,不参与校验。

**Rationale**: 代码优先避免手写 yaml 与实现漂移。Zod 与 swagger 装饰器的字段名会有轻微重复 —— 这是代码优先 OpenAPI 的固有代价,记入 Complexity Tracking(宪法 V 的有意复杂度)。

**Alternatives considered**:
- 契约优先(yaml 先行)→ 与宪法 V"Zod 是唯一真相源"冲突,需额外对齐层。否决。
- `zod-to-openapi` 自动从 Zod 推 schema → 减少 `@ApiProperty` 重复,但引入新依赖且映射不全可靠。**记为后续优化项**,首版手写 `@ApiProperty` 保证文档准确。

**web 端类型生成**: `apps/web` 加 `openapi-typescript`,从 `openapi.json` 生成 client 类型,**仅服务开放客户端调用**;管理端继续用现有 `@magi/types` Zod VO(不替换)。

---

## D7 — 限流:进程内内存版

**Decision**: 首版用 NestJS `ThrottlerGuard`(基于内存,单实例足够)。按 `key_prefix` 或 keyId 维度限流(非全局 IP),阈值默认 60 req/min/key。

**Rationale**: spec Assumption 明确"分布式限流留待后续"。`@nestjs/throttler` 是 NestJS 官方,无新风险。V2 上 Redis 版时只换 storage adapter。

---

## D8 — 复用范围(已验证纯 use-case)

可被 `OpenApiController` 直接 `@Inject` 的现有 use-case(均已确认 `@Injectable` 且不碰 HTTP):

- `FindCanonicalChannelsUseCase` — `execute(query)` / `findGroups()` / `countByLifecycle()`(`find-canonical-channels.use-case.ts`)
- `FindOutputChannelDetailUseCase` — `execute(id)` → channel + streams(详情用,但开放接口只投影 channel 子集,**不带 streams**,FR-012)
- `FindOutputGuideUseCase` — `execute({ from, to, channelId?, group?, search?, status?, page, pageSize })` → 节目单

**业务逻辑零修改**:这些 use-case 取 plain query 返回 domain model,开放接口只是换了 HTTP 外壳 + 鉴权 + 投影。

---

## D9 — `/output/*` 不动

**Decision**: 现有 `OutputController`(12 读 + 13 管理路由,共用 `AuthGuard`)一字不改。开放接口是**并行独立入口**(`/api/open/v1/*`)。

**Rationale**: spec Assumption。避免动现有后台 + 成熟播放器(TiviMate)输出链路,降低风险。

---

## D10 — 响应投影(产品视图)

**Decision**: 新建投影 VO `OpenChannelVo` / `OpenProgrammeVo` / `OpenGroupVo`(放 `packages/types/src/vo/`),从现有 domain model 投影,**只保留**:

- channel: `magi:{id}`、`standardName`、`standardGroup`、`standardLogo`、`channelNumber`
- programme: `title`、`startAt`、`stopAt`、`category`
- group: `name`、`count`

**绝不暴露**: `streamUrl`、`sourceId`、`healthStatus`、`lifecycle`、`primaryStreamId`、`epgBinding` 内部字段等(FR-012)。

**投影位置**: 在 `OpenApiController` 内做 domain→OpenVo 映射(仿现有 `toChannelVo` helper 模式),不污染 use-case。

---

## 现有基础设施复用清单

| 能力 | 现有实现 | 复用方式 |
|---|---|---|
| 错误响应 | `ProblemDetailsFilter`(全局,`application/problem+json`) | 新增错误码 `api-key-required`/`api-key-invalid`/`rate-limit-exceeded` |
| 响应包装 | `ApiResponse<T>` / `PaginatedResponse<T>` | 直接用 |
| 审计 | `AppendAuditEventUseCase` + `currentRequestId()` | 管理操作调用 |
| 请求链路 | `RequestContextMiddleware`(`x-request-id` + AsyncLocalStorage) | 自动生效 |
| 乐观锁 | ETag/If-Match helpers | 本特性只读 + key 管理(key 表带 version 但首版不强制 If-Match) |
| 日志脱敏 | `backup-redactor.ts` 覆盖 `token\|secret\|key` | 确认日志层一致 |
| better-auth | session cookie(`AuthGuard`) | 仅管理端用 |

---

## 无 NEEDS CLARIFICATION 残留

所有技术决策均已锁定(spec 约束 + 本 research)。无未决项。
