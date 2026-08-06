# Tasks: 开放接口平台 — 频道与节目单只读 API

**Input**: Design documents from `/specs/005-open-channels-epg-api/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: 包含关键路径测试任务(鉴权隔离、状态机、投影泄露),遵循项目宪法"Red-Green-Refactor"。基线:本项目使用 Vitest,测试与源码同目录 `__tests__/` 模式。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- 后端 API:`apps/api/src/`(分层 `http/` `application/` `domain/` `infrastructure/` `shared/`)
- 共享 schema:`packages/backend-core/src/database/schema/`
- 共享类型:`packages/types/src/`
- Web 管理端:`apps/web/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 依赖安装 + schema + 契约类型骨架。无业务逻辑。

- [ ] T001 安装后端新依赖:`@nestjs/swagger`、`@nestjs/throttler` 到 `apps/api/package.json`
- [ ] T002 [P] 安装 web 新依赖:`openapi-typescript`(dev)到 `apps/web/package.json`,并在 package.json 加 `"gen:openapi-types"` 脚本(从 `/api/open.json` 生成到 `apps/web/src/services/openapi-types.ts`)
- [ ] T003 [P] 新建 `api_keys` schema 于 `packages/backend-core/src/database/schema/api-keys.ts`(字段见 data-model.md:`id/name/key_hash/key_prefix/status/expires_at/scopes/last_used_at/created_by/version/timestamps`;`unique(key_hash)`、`index(status)`),并从 `packages/backend-core/src/database/schema/index.ts` 导出 `apiKeys`
- [ ] T004 [P] 在 `apps/api/src/infrastructure/database/schema/index.ts` re-export `apiKeys`,并在 `apps/api/src/infrastructure/database/drizzle.config.ts` 的 `sharedSchemaTables` 数组追加 `"api-keys"`
- [ ] T005 运行 `pnpm --filter @magi/api db:generate` 产出迁移 `apps/api/drizzle/0003_*.sql`,人工核对 SQL(含 unique/index),再 `pnpm --filter @magi/api db:migrate` 应用
- [ ] T006 [P] 新建契约类型:在 `packages/types/src/vo/index.ts` 追加 `OpenChannelVo`、`OpenProgrammeVo`、`OpenGroupVo`、`ApiKeyVo`、`ApiKeyCreatedVo`(字段见 data-model.md / contracts)
- [ ] T007 [P] 新建 Zod DTO:在 `packages/types/src/dto/api-key.ts` 定义 `CreateApiKeySchema`(`name` 1-120、`expiresAt` 可选 ISO)、`ListApiKeysQuerySchema`(`page/pageSize/status?/search?`),并从 `packages/types/src/dto/index.ts` 导出
- [ ] T008 [P] 新建开放接口 query Zod 于 `packages/types/src/dto/open-api.ts`:`OpenChannelsQuerySchema`(`page/pageSize/group?/search?`)、`OpenEpgQuerySchema`(`from/to 必填 ISO, to-from≤7天, group?/channelId?/search?/page/pageSize`)、`OpenPaginationSchema`,并导出

**Checkpoint**: 依赖装好、表建好、共享类型/DTO 骨架就位。尚未写任何运行时逻辑。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 鉴权与隔离基础设施 —— 所有 user story 都依赖它。⚠️ 完成 Phase 2 前 user story 不得开工。

### domain + infrastructure(api_keys 持久化与状态机)

- [ ] T009 [P] 新建 domain model `apps/api/src/domain/api-key/api-key.model.ts`:定义 `ApiKey` interface、`ApiKeyStatus = "active"|"disabled"|"revoked"`、`ApiKeyModel` 类含 `canTransitionTo(next)` 状态机(active⇄disabled、→revoked 终态)与 `isUsable(now)`(status=active 且未过期)。`index.ts` barrel
- [ ] T010 [P] 新建 repo 接口 `apps/api/src/domain/api-key/api-key.repository.ts`:`IApiKeyRepository` 含 `create`/`findById`/`findActiveByHash`/`findPaginated`/`updateStatus`/`touchLastUsed`/`delete`
- [ ] T011 新建 Drizzle 实现 `apps/api/src/infrastructure/database/api-key.repository.ts`(实现 `IApiKeyRepository`,行↔domain 映射,仿现有 `channel-stream.repository.ts` 的 `toDomain` 模式)

### guard + decorator(鉴权隔离核心)

- [ ] T012 [P] 新建 `apps/api/src/shared/guards/api-key.guard.ts`:读 `Authorization: Bearer magi_...` 或 `x-api-key` → `sha256` hex → `findActiveByHash` → 命中且 `isUsable` 则挂 `req.apiKey` 并异步 `touchLastUsed`,否则抛 `UnauthorizedException`(带 code `api-key-required`/`api-key-invalid`)。**禁止任何 session cookie fallback**
- [ ] T013 [P] 新建 `apps/api/src/shared/decorators/api-key.decorator.ts`:`@ApiKey()` 参数装饰器取 `req.apiKey`(仿现有 `@CurrentUser`)
- [ ] T014 扩展错误码:在 `apps/api/src/shared/http/problem-details.filter.ts` 注册新 code `api-key-required`、`api-key-invalid`、`rate-limit-exceeded`(沿用现有 `application/problem+json` 形态)

### 隔离测试(宪法 V 关键,TDD 先行)

- [ ] T015 [P] 写失败测试 `apps/api/src/shared/guards/__tests__/api-key.guard.test.ts`:① 无凭据→401 `api-key-required`;② 错/禁用/吊销/过期 key→401 `api-key-invalid`(不区分原因);③ 合法 key→放行且挂 req.apiKey;④ **隔离**:带 admin session cookie 但无 key→401(FR-019)
- [ ] T016 [P] 写失败测试 `apps/api/src/domain/api-key/__tests__/api-key.model.test.ts`:状态机 `active⇄disabled` 合法、`revoked→任何` 非法、`isUsable` 对过期/非 active 返回 false

**Checkpoint**: 鉴权层可用,隔离由测试守护。T015/T016 测试红 → 实现后转绿。

---

## Phase 3: User Story 1 - 管理员签发 API key (Priority: P1) 🎯 MVP

**Goal**: 管理员登录后台,创建一把命名的 API key,一次性拿到明文,列表只显打码前缀。

**Independent Test**: 见 quickstart.md 场景1 步骤1 —— 登录后台创建 key,看到一次性明文 + 列表打码前缀。可独立于"客户端调用"完成。

### Implementation for User Story 1

- [ ] T017 [P] [US1] 新建 use-case `apps/api/src/application/api-key/create-api-key.use-case.ts`:生成明文 `magi_<32 base62>`,计算 `sha256`→`key_hash`、`key_prefix=明文.slice(0,8)+"…"`,经 `IApiKeyRepository.create` 持久化(status=active),返回 `{ apiKey(含明文) }`。明文不落库
- [ ] T018 [P] [US1] 新建 use-case `apps/api/src/application/api-key/list-api-keys.use-case.ts`:`findPaginated(query)` 返回 `ApiKeyVo[]`(用 `OpenPaginationSchema` 分页),**剥离明文与 hash**,只显 prefix
- [ ] T019 [US1] 新建控制器 `apps/api/src/http/api-key/api-key.controller.ts`:`@Controller("api/admin/api-keys")` + `@UseGuards(AuthGuard)`(现有 session guard)。实现 `POST /`(Zod `CreateApiKeySchema` 校验,调 create use-case,返回 `ApiKeyCreatedVo` 含明文,审计 `api_key.created`)、`GET /`(Zod `ListApiKeysQuerySchema`,调 list use-case)
- [ ] T020 [US1] 新建 `apps/api/src/http/api-key/api-key.module.ts`:绑定 `IApiKeyRepository`→Drizzle 实现(字符串 token `API_KEY_REPOSITORY`),注册 use-case 与控制器
- [ ] T021 [US1] 在 `apps/api/src/http/http.module.ts` 的 `imports` 追加 `ApiKeyModule`

### Web 管理页(US1)

- [ ] T022 [P] [US1] 新建路由 `apps/web/src/routes/dashboard/api-keys.tsx`:`createFileRoute("/dashboard/api-keys")`,ProTable 列(name/keyPrefix/status/lastUsedAt/createdAt/操作),"新建"ModalForm(name + 可选 expiresAt)调 `POST /api/admin/api-keys`
- [ ] T023 [US1] 创建成功后弹窗一次性展示明文 + "复制"按钮(antd `Typography.Paragraph copyable`),关闭后不可再取(US1-AC2)。**禁止**把明文存入组件 state 之外的任何地方
- [ ] T024 [US1] 在 `apps/web/src/components/app-menu.tsx` 的 `NAV_SECTIONS` 新增"开放接口"分组(或挂 output 下),含 `api-keys` 子项(参考 output-addresses 的导航写法)
- [ ] T025 [US1] 重新生成路由树:`apps/web/src/routeTree.gen.ts`(dev 模式自动,或手动跑 web dev 触发)

**Checkpoint**: US1 完成 —— 管理员可签发 key,明文一次性显示,列表打码。这是整个开放平台的前提(MVP)。

---

## Phase 4: User Story 2 - 外部客户端凭 key 读频道 (Priority: P1)

**Goal**: 持有有效 key 的客户端读频道列表/详情/分组,只拿到产品视图字段。

**Independent Test**: 见 quickstart.md 场景1 步骤2/3 —— 用 US1 签发的 key 读 channels,字段零运维泄露,且 admin cookie 不能访问开放接口。

### Implementation for User Story 2

- [ ] T026 [P] [US2] 新建控制器 `apps/api/src/http/open/open.controller.ts`:`@Controller("api/open/v1")` + `@UseGuards(ApiKeyGuard, ThrottlerGuard)`。`@ApiTags("开放接口")`。三个端点:
  - `GET /groups` → 调 `FindCanonicalChannelsUseCase.findGroups()` → 投影 `OpenGroupVo[]`
  - `GET /channels` → Zod `OpenChannelsQuerySchema` → 调 `findChannels.execute(query)` → **过滤** `shouldBeInOutput()` → 投影 `OpenChannelVo` 分页
  - `GET /channels/:id` → 调 `FindOutputChannelDetailUseCase.execute(id)` → 投影 `OpenChannelVo`(**不带 streams**),不可见/不存在→404
- [ ] T027 [P] [US2] 在 `open.controller.ts` 内实现 domain→OpenVo 投影 helper `toOpenChannelVo(ch)`(字段:`id=magi:${ch.id}`/name/group/logo/channelNumber,**绝不**含 streamUrl/sourceId/health/lifecycle)、`toOpenGroupVo(g)`(FR-012)
- [ ] T028 [US2] 新建 `apps/api/src/http/open/open.module.ts`:注入现有 `FindCanonicalChannelsUseCase`、`FindOutputChannelDetailUseCase`(字符串/类 token,与 OutputModule 一致),注册控制器
- [ ] T029 [US2] 在 `apps/api/src/http/http.module.ts` 的 `imports` 追加 `OpenModule`
- [ ] T030 [US2] 写投影泄露测试 `apps/api/src/http/open/__tests__/open-projection.test.ts`:断言 channels/detail 响应 JSON 中**不出现** `streamUrl`/`sourceId`/`healthStatus`/`lifecycle`/`primaryStreamId` 等键(用 `JSON.stringify` 反向断言),且已隐藏频道不出现(FR-011)

### OpenAPI 装饰器(US2 顺带,服务 US4)

- [ ] T031 [US2] 给 `open.controller.ts` 每个端点加 `@ApiOperation`/`@ApiResponse`(基于 `OpenChannelVo` 等),并在端点 DTO 参数加 `@ApiProperty` 描述(代码优先文档生成,见 plan.md Complexity Tracking)
- [ ] T032 [US2] 在 `apps/api/src/main.ts` 挂 `SwaggerModule.setup("api/docs", app, document)`(`DocumentBuilder` 设 title/version),并暴露 `api/open.json`(SwaggerModule 默认路径或自定义路由)。确认 `/api/docs` 与 `/api/open.json` 可访问

**Checkpoint**: US1+US2 构成最小闭环 —— 管理员签发 key,客户端凭 key 读频道。隔离与零泄露由测试守护。

---

## Phase 5: User Story 3 - 凭 key 读节目单 (Priority: P2)

**Goal**: 客户端在时间窗内读节目单,超窗被拒,不可见频道节目不返回。

**Independent Test**: 见 quickstart.md 场景2 —— 指定 from/to 读 EPG,超 7 天返回 400。

### Implementation for User Story 3

- [ ] T033 [P] [US3] 在 `apps/api/src/http/open/open.controller.ts` 新增 `GET /epg`:Zod `OpenEpgQuerySchema` 校验(含 `to-from≤7天`,超→400 `validation-failed`)→ 调 `FindOutputGuideUseCase.execute({from,to,group,channelId,search,page,pageSize})` → **过滤**仅对外可见频道 → 投影 `OpenProgrammeVo`(channelId/title/subTitle/startAt/stopAt/category)
- [ ] T034 [US3] 加投影 helper `toOpenProgrammeVo(p, channelIdMap)`(将 `xmltvChannelId` 经 EPG 绑定映射回 `magi:{canonicalId}`;不可见频道节目过滤掉)
- [ ] T035 [US3] 给 `/epg` 加 swagger 装饰器(`@ApiOperation`/`@ApiResponse`/`@ApiQuery`)
- [ ] T036 [US3] 写测试 `apps/api/src/http/open/__tests__/open-epg.test.ts`:① 合法时间窗返回节目;② 超 7 天→400;③ `from≥to`→400;④ 不可见频道节目不返回(FR-011/US3-AC3)

**Checkpoint**: 频道+节目单两条核心数据交付完成。

---

## Phase 6: User Story 4 - 开发者凭 OpenAPI 自助接入 (Priority: P2)

**Goal**: `/api/docs`(Swagger UI)与 `/api/open.json`(机器可读)一致、可校验、可生成 client。

**Independent Test**: 见 quickstart.md 场景4 —— 访问 docs + open.json,用 redocly lint 通过。

### Implementation for User Story 4

- [ ] T037 [P] [US4] 给 `api-key.controller.ts`(管理端)也加 `@ApiTags("API Key 管理")` + `@ApiOperation`/`@ApiResponse`(管理端契约也进文档,但**不含明文 key 字段的示例**)
- [ ] T038 [US4] 校验 OpenAPI 产出:启动 api,`curl /api/open.json` 用 `npx @redocly/cli lint -` 通过(无 error);核对 `.paths` 覆盖全部开放 + 管理端点(US4-AC2)
- [ ] T039 [US4] 配置 web 端类型生成:运行 `apps/web` 的 `gen:openapi-types` 脚本从 `/api/open.json` 生成 `apps/web/src/services/openapi-types.ts`,确认生成的类型与 `OpenChannelVo` 等结构匹配(US4-AC3)。提交生成产物

**Checkpoint**: 开放契约可自助消费 —— 第三方无需联系维护者即可接入。

---

## Phase 7: User Story 5 - 吊销与清理 (Priority: P3)

**Goal**: 禁用/启用/吊销/删除 key,状态机守护,审计可查,失效即时生效。

**Independent Test**: 见 quickstart.md 场景3 —— 吊销后下次请求即 401,审计可查。

### Implementation for User Story 5

- [ ] T040 [P] [US5] 新建 use-case `apps/api/src/application/api-key/transition-api-key-status.use-case.ts`:统一处理 disable/enable/revoke,经 `ApiKeyModel.canTransitionTo` 校验,非法转换抛 `invalid-state-transition`(409),合法则 `updateStatus`。revoke 单向终态
- [ ] T041 [P] [US5] 新建 use-case `apps/api/src/application/api-key/delete-api-key.use-case.ts`:`delete(id)`(任意状态可删)
- [ ] T042 [US5] 在 `api-key.controller.ts` 追加:`POST /:id/disable`、`/enable`、`/revoke`(调 transition use-case,审计 `api_key.disabled/enabled/revoked`)、`DELETE /:id`(调 delete use-case,审计 `api_key.deleted`)
- [ ] T043 [US5] 加 swagger 装饰器到上述 4 个端点
- [ ] T044 [US5] 写测试 `apps/api/src/application/api-key/__tests__/transition-status.test.ts`:① active⇄disabled 合法;② revoked→enable 抛 409;③ 重复 disable 抛 409
- [ ] T045 [US5] 写集成测试 `apps/api/src/http/api-key/__tests__/lifecycle-e2e.test.ts`:禁用后该 key 调开放接口立即 401(US5-AC1);吊销不可逆;审计事件落库可查(US5-AC2)
- [ ] T046 [US5] Web 页 `api-keys.tsx` 增加操作列:禁用/启用/吊销/删除(antd Popconfirm 确认危险操作),调对应端点,成功后 ProTable 刷新

**Checkpoint**: 运维与安全收尾能力就绪,正式运营闭环完成。

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 限流、可观测、文档收尾。

- [ ] T047 [P] 配置 `@nestjs/throttler`:在 `apps/api/src/app.module.ts` 注册 `ThrottlerModule`(默认 60/min),用 `APP_GUARD` 挂 `ThrottlerGuard` 或仅在 `OpenController` 上 `@UseGuards(ThrottlerGuard)`。验证超限→429 `rate-limit-exceeded`(quickstart 场景5)
- [ ] T048 [P] 确认日志脱敏:开放接口请求日志中 **不得**出现明文 key(宪法 VII)。核对 `apps/api/src` 的 logger 配置/`backup-redactor` 覆盖;`req.apiKey` 序列化时只显 id/prefix
- [ ] T049 [P] 开放接口请求带 `x-request-id` 链路(复用 `RequestContextMiddleware`,无需新代码,仅验证 `apiKeyId` 进日志上下文)
- [ ] T050 [P] 更新文档:`docs/android-tv-admin-preparation.md` 的 P0 状态表(开放 API 行从 ⬜ 推进到 ✅/🟡),README 的 API Endpoints 章节追加"开放接口"小节
- [ ] T051 [P] 更新 `.specify/memory/constitution.md`?—— 评估本特性的新运行时依赖(`@nestjs/swagger`/`@nestjs/throttler`/`openapi-typescript`)是否触发宪法修订(按治理章节:仅"技术栈标准"表需在 PR 描述说明理由,**无需** MAJOR/MINOR 修订,除非要纳入标准表)。在 PR 描述写明理由即可
- [ ] T052 跑质量门槛:`pnpm lint` + `pnpm build` + 各包 `tsc --noEmit` 全绿(宪法"开发流程")
- [ ] T053 按 `specs/005-open-channels-epg-api/quickstart.md` 全量手测 5 个场景,记录结果(可选:产出 `validation-results.md` 仿 specs/004 模式)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖,立即开始。T005(db:generate/migrate)依赖 T003/T004 完成
- **Foundational (Phase 2)**: 依赖 Setup。**阻塞所有 user story**
- **User Stories (Phase 3-7)**: 全部依赖 Phase 2 完成
- **Polish (Phase 8)**: 依赖所有相关 user story 完成(限流 T047 依赖 OpenController 存在)

### User Story Dependencies

- **US1 (P1, MVP)**: 依赖 Phase 2。**无其他 story 依赖**。最先做(整个平台的前提)
- **US2 (P1)**: 依赖 Phase 2 + US1(需 US1 签发的 key 才能端到端测)。但实现上可与 US1 并行(只依赖 guard 基础设施)
- **US3 (P2)**: 依赖 Phase 2 + US2(复用 OpenController/投影模式)。可独立测(只验 /epg)
- **US4 (P2)**: 依赖 US2/US3 的 swagger 装饰器存在(US2 的 T031/T032、US3 的 T035 是其输入)
- **US5 (P3)**: 依赖 Phase 2 + US1(扩 api-key.controller)。可独立测

### Within Each User Story

- domain/model → use-case → controller → 装饰器 → 测试
- 投影 helper 与控制器同文件,不单独成 task(T027/T034 内联)

### Parallel Opportunities

- Phase 1 的 T002-T004、T006-T008 全部 [P](不同文件)
- Phase 2 的 T009/T010/T012/T013/T014/T015/T016 多为 [P](domain/guard/decorator/filter/test 各异文件)
- US1 的 T017/T018(create/list use-case)[P]
- US2 的 T026/T027 在同一文件,顺序;但 T030 测试可与 US3 部分并行
- 不同 user story 在 Phase 2 完成后可并行(单人则按 P1→P2→P3 顺序)

---

## Parallel Example: Phase 1 Setup

```bash
# 这些任务文件互不冲突,可并行:
Task: "T002 安装 web openapi-typescript + 脚本 到 apps/web/package.json"
Task: "T003 新建 api_keys schema 到 packages/backend-core/.../api-keys.ts"
Task: "T004 re-export apiKeys + drizzle.config.ts"
Task: "T006 追加 VO 到 packages/types/src/vo/index.ts"
Task: "T007 新建 Zod DTO 到 packages/types/src/dto/api-key.ts"
Task: "T008 新建 open-api query Zod 到 packages/types/src/dto/open-api.ts"
# 之后串行:T005(db:generate 依赖 T003/T004)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1 Setup(T001-T008)
2. Phase 2 Foundational(T009-T016,鉴权隔离由 T015/T016 测试守护)
3. Phase 3 US1(T017-T025)
4. **STOP & VALIDATE**:管理员能签发 key、列表打码 —— quickstart 场景1 步骤1
5. 此时虽无消费方,但凭据签发能力已可独立交付/演示

### Incremental Delivery

1. Setup + Foundational → 鉴权隔离就绪
2. + US1 → 可签发 key(MVP)
3. + US2 → 客户端可读频道(最小闭环,可真机验证 Android TV 雏形)
4. + US3 → 可读节目单
5. + US4 → 开放契约可自助消费(真正"开放")
6. + US5 → 吊销/清理(正式运营闭环)
7. Polish → 限流/可观测/文档

### Parallel Team Strategy

单人按 P1→P2→P3 顺序最优(每步可独立验证、可提交)。若有 2 人:Phase 2 后,A 做 US1(管理端 key),B 做 US2(开放读频道),二者只通过"签发的 key"集成。

---

## Notes

- [P] = 不同文件、无依赖
- [Story] 标签用于可追溯
- 每个 user story 独立可完成、可测试
- 鉴权隔离(US2-T015)与投影泄露(US2-T030)是本特性**最该测**的两点 —— 关系到 FR-012/FR-019 的安全语义
- 提交粒度:每个 task 或逻辑组一次 commit(Conventional Commits,scope 用 `api`/`web`/`types`/`backend-core`)
- 现有 `/output/*`、`channel.controller`、`programme.controller` 零修改 —— 任何 task 不得触碰它们(违反 spec Assumption)
