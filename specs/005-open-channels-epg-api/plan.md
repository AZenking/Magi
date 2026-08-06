# Implementation Plan: 开放接口平台 — 频道与节目单只读 API

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-open-channels-epg-api/spec.md`

## Summary

构建一个通用开放接口平台,让任意外部消费方(脚本、第三方播放器、Android TV)凭 **API key** 只读访问 Magi 整理后的**频道列表**和**节目单**。技术路径(research.md D1–D10):

- **数据源复用**现有规整输出层 —— 注入现有纯 use-case(`FindCanonicalChannelsUseCase` / `FindOutputGuideUseCase` / `FindOutputChannelDetailUseCase`),业务逻辑零修改,只换 HTTP 外壳 + 鉴权 + 产品视图投影。
- **自建 `api_keys` 表 + `ApiKeyGuard`**(SHA-256 比对,不存明文),与现有 better-auth session(`AuthGuard`)**物理隔离**。
- **代码优先 OpenAPI**(`@nestjs/swagger`),产出 `/api/open.json` + `/api/docs`;DTO 校验仍用 Zod(宪法 V),swagger 装饰器只管文档。
- 管理端(`/api/admin/api-keys/*`,现有 AuthGuard)负责签发/禁用/吊销,复用 `AppendAuditEventUseCase` 审计。
- 现有 `/output/*` 与原始数据路由**完全不动**,开放接口是独立并行入口。

## Technical Context

**Language/Version**: TypeScript 5.x (Node ≥ 20)

**Primary Dependencies**:
- 现有:NestJS、Drizzle ORM、PostgreSQL、better-auth 1.6、Zod、Zod 校验模式、`ProblemDetailsFilter`、`@magi/types`、`@magi/backend-core`
- **新增**:`@nestjs/swagger`(api,OpenAPI 文档生成)、`@nestjs/throttler`(限流)、`openapi-typescript`(web,client 类型生成)

**Storage**: PostgreSQL(新表 `api_keys`,建在 `packages/backend-core`)

**Testing**: Vitest(沿用现有 `apps/api/vitest.config.ts` + `__tests__/` 同目录模式)

**Target Platform**: Linux server(Docker Compose 部署),API `:3001`

**Project Type**: web-service(NestJS API)+ web admin(TanStack Start)

**Performance Goals**: 开放接口 p95 < 200ms(复用现有 use-case,无新重活);限流保护下单 key 60 req/min

**Constraints**:
- 现有 `/output/*`、`channel.controller`、`programme.controller` 零修改
- 凭据明文永不存储/永不入日志(FR-002/FR-021)
- 双向鉴权隔离(FR-019)

**Scale/Scope**: 单实例自托管首版;新增 1 张表、2 个 HTTP 模块(开放+管理)、1 个 guard、1 个 web 页面

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

对照 `.specify/memory/constitution.md` v2.2.0:

| 原则 | 合规性 | 说明 |
|---|---|---|
| **I. 整洁架构(分层)** | ✅ 通过 | Controller→UseCase→Domain→Repo。`OpenApiController`/`ApiKeyAdminController` 只做参数校验+DTO 转换+投影;复用现有 use-case(已验证不碰 HTTP/auth);新 `ApiKeyGuard` 在 shared 层;新 repo 接口在 domain、Drizzle 实现在 infrastructure。 |
| **II. 单仓多包** | ✅ 通过 | `api_keys` 表建在 `packages/backend-core/src/database/schema/`(宪法 II 明确运营表归属);DTO/VO 在 `packages/types`;不跨 app 直接导入。 |
| **III. 领域独立** | ✅ 通过 | 新 `domain/api-key/` 仅含 model + repo 接口,不依赖 NestJS/Drizzle。 |
| **IV. 重活优先异步** | ✅ N/A | 本特性全部只读查询 + 轻量 key CRUD,无重活,不需 BullMQ。 |
| **V. 端到端类型安全** | ⚠ 有意复杂度(见 Complexity Tracking) | DTO 校验用 Zod(真相源不变);`@nestjs/swagger` 的 `@ApiProperty` 为文档生成存在第二套字段元数据。两者字段名会轻微重复。**判定:可接受,记入 Complexity Tracking**,理由是"代码优先 OpenAPI"是 spec FR-016/017/018 的硬性要求,且不破坏 Zod 校验真相源。无 `any`。 |
| **VI. 长期可维护性(YAGNI)** | ✅ 通过 | `scopes` 字段预留但**不实现**细粒度可见性;限流用进程内版不预上 Redis;不预先做多租户。复用而非新建数据源。 |
| **VII. 可观测性** | ✅ 通过 | 复用 `RequestContextMiddleware`(`x-request-id` 链路);key 管理走 `AppendAuditEventUseCase`;日志脱敏复用现有 `backup-redactor.ts` 覆盖的 `token\|secret\|key`;新增开放接口请求带结构化日志。 |
| 技术栈标准 | ✅ 通过 | 新依赖(`@nestjs/swagger`/`@nestjs/throttler`/`openapi-typescript`)均为 NestJS/TS 生态标准库,需在 PR 描述说明理由(宪法"新增运行时依赖")。不触碰前端 UI 栈(antd v6)。 |
| 开发流程 | ✅ 通过 | schema 变更配套 `db:generate`+`db:migrate`(同 PR);合并前 `pnpm lint`/`pnpm build`/`tsc --noEmit`。 |

**Phase 1 设计后复检**:data-model.md / contracts / 实施路径均不引入新违规。宪法 V 的双重元数据已在下方 Complexity Tracking 正式记录。**Gate 通过。**

## Project Structure

### Documentation (this feature)

```text
specs/005-open-channels-epg-api/
├── plan.md              # 本文件(/speckit-plan)
├── research.md          # Phase 0 — 技术决策 D1–D10
├── data-model.md        # Phase 1 — api_keys 表 + 投影 VO + 状态机
├── quickstart.md        # Phase 1 — 端到端验证指南
├── contracts/           # Phase 1 — 接口契约
│   ├── open-api.md          # /api/open/v1/* 只读
│   └── admin-api-keys.md    # /api/admin/api-keys/* 管理
├── checklists/
│   └── requirements.md  # /speckit-specify 质量校验(已通过)
└── tasks.md             # /speckit-tasks 产出(本命令不创建)
```

### Source Code (repository root)

```text
# —— 新增 schema(宪法 II:运营表在 backend-core)——
packages/backend-core/src/database/schema/
├── api-keys.ts                         # 新表 api_keys
└── index.ts                            # +export { apiKeys }

apps/api/src/infrastructure/database/
├── schema/index.ts                     # +re-export apiKeys
├── drizzle.config.ts                   # sharedSchemaTables 加 "api-keys"
├── api-key.repository.ts               # Drizzle 实现 IApiKeyRepository
└── drizzle/0003_*.sql                  # db:generate 产出

# —— domain(宪法 III:不依赖框架/ORM)——
apps/api/src/domain/api-key/
├── api-key.model.ts                    # ApiKey domain model + 状态机
├── api-key.repository.ts               # IApiKeyRepository 接口
└── index.ts

# —— application(use-case)——
apps/api/src/application/api-key/
├── create-api-key.use-case.ts          # 生成明文+hash,持久化,返回明文一次
├── list-api-keys.use-case.ts
├── transition-api-key-status.use-case.ts  # disable/enable/revoke 共用,校验状态机
└── delete-api-key.use-case.ts

# —— shared(guard + decorator)——
apps/api/src/shared/
├── guards/api-key.guard.ts             # Bearer/x-api-key → sha256 → 查表
├── decorators/api-key.decorator.ts     # @ApiKey() 取 req.apiKey
├── http/problem-details.filter.ts      # +错误码 api-key-required/invalid/rate-limit-exceeded
└── (复用 guards/auth.guard.ts,不改)

# —— http(新模块,宪法 I 分层)——
apps/api/src/http/
├── open/                               # /api/open/v1/* 只读 + ApiKeyGuard
│   ├── open.controller.ts              # 注入现有 use-case + 投影 domain→OpenVo
│   └── open.module.ts
├── api-key/                            # /api/admin/api-keys/* 管理 + AuthGuard
│   ├── api-key.controller.ts           # 注入新 use-case + AppendAuditEventUseCase
│   └── api-key.module.ts
└── http.module.ts                      # imports +OpenModule, ApiKeyModule

# —— 契约类型(宪法 II:VO/DTO 在 packages/types)——
packages/types/src/
├── vo/index.ts                         # +OpenChannelVo, OpenProgrammeVo, OpenGroupVo, ApiKeyVo, ApiKeyCreatedVo
├── dto/api-key.ts                      # Zod: CreateApiKeySchema, ListApiKeysSchema 等
└── (开放接口 query 校验也在此)

# —— OpenAPI 产出 + 限流 ——
apps/api/src/main.ts                    # +SwaggerModule.setup("api/docs") + open.json; +ThrottlerModule
apps/api/src/app.module.ts              # +ThrottlerGuard(若全局)

# —— Web 管理页 ——
apps/web/src/
├── routes/dashboard/api-keys.tsx       # 仿 output-addresses.tsx 的 ProTable + ModalForm
├── components/app-menu.tsx             # NAV_SECTIONS +「开放接口」
└── routeTree.gen.ts                    # TanStack Router 自动重生成

# —— web client 类型生成(开放客户端用)——
apps/web/package.json                   # +openapi-typescript + script
```

**Structure Decision**: 严格沿用现有整洁分层(每个 http 模块自带 module.ts 注入 repo 接口 + use-case;repo 用字符串 token 注入,仿 `output.module.ts`)。开放接口与管理接口分属两个独立模块,鉴权 guard 不同,不共享控制器。`/output/*`、`channel.controller`、`programme.controller` 零修改。

## Complexity Tracking

> 宪法 Check 中宪法 V 存在一项需论证的"有意复杂度",正式记录如下。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 宪法 V:DTO 存在两套字段元数据 —— Zod(校验真相源)+ `@nestjs/swagger @ApiProperty`(文档生成) | spec FR-016/017/018 **硬性要求**"提供机器可读的 OpenAPI 规范 + 交互式文档 + 规范与文档一致且可被标准工具校验";"开放接口"的语义核心就是契约可被外部自助消费(US4) | **(a) 契约优先(yaml 先行)**:与宪法 V"Zod 是唯一真相源"直接冲突,需额外双向同步层,且手写 yaml 易与实现漂移 —— 漂移正是 FR-018 要杜绝的。**(b) `zod-to-openapi` 自动派生**:减少重复但引入新依赖,且 Zod→OpenAPI 映射对联合类型/refinements 不可靠,生成的文档可能误导外部接入方(违反 US4-AC2/AC3 "规范与实际响应结构匹配")。首版手写 `@ApiProperty` 保证文档**准确**,准确是开放契约的第一优先级;自动派生列为后续优化项,在出现"字段重复维护成本"具体痛点后再引入。 |

> 该复杂度**不涉及**架构分层、数据归属或异步边界,仅是文档元数据与校验元数据的并存。Zod 仍是唯一校验真相源(宪法 V 不破)。

---

## Phase 状态

- **Phase 0(research)**: ✅ 完成 → [research.md](./research.md)(D1–D10 全部锁定,无 NEEDS CLARIFICATION 残留)
- **Phase 1(design)**: ✅ 完成 → [data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)
- **Phase 2(tasks)**: ⏳ 待 `/speckit-tasks`(下一步)
