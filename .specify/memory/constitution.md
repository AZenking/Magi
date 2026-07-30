<!--
同步影响报告
==================
版本变更：2.2.0 → 3.0.0
- MAJOR（主版本）：Android TV 成为正式的一等客户端后，原有“整个 monorepo 强制
  TypeScript”及“所有 app 必须直接消费 packages/types”的治理规则不再兼容。
  本次将跨语言契约改为 OpenAPI 边界，并为 Kotlin/Compose TV 客户端新增强制原则。

修改的原则：
- I. 整洁架构（分层）→ 扩展 Android TV 的 presentation/domain/data/platform 依赖规则。
- II. 单仓多包 → 明确 apps/tv 是独立 Gradle 工程，跨语言共享通过 OpenAPI 契约。
- V. 端到端类型安全 → 重命名为“端到端契约与类型安全”，区分 TypeScript 与 Kotlin。

新增原则：
- VIII. Android TV 遥控器优先与播放可靠性。

新增/扩展章节：
- 技术栈标准：锁定 Kotlin、Compose for TV、Media3、Retrofit、DataStore 与 JDK 17。
- 开发流程与质量门槛：新增 Android TV 构建、单测、lint、焦点和实机播放验收门槛。

移除章节：
- 无。

模板同步：
- ✅ .specify/templates/plan-template.md — 新增 Android TV Constitution Check。
- ✅ .specify/templates/spec-template.md — 新增 TV 交互、恢复与 10-foot UI 要求。
- ✅ .specify/templates/tasks-template.md — 新增 TV 测试、焦点、播放和实机验收任务。
- ✅ .specify/templates/checklist-template.md — 增加 TV 专项检查清单生成要求。
- ✅ README.md — 增加 Android TV 技术栈与质量门槛。
- ✅ docs/architecture.md — 增加 TV 分层、焦点与播放器边界。
- ✅ .specify/templates/commands/*.md — 目录不存在，无需更新。

待处理的既有合规债务：
- ⚠ apps/tv：配置保存前尚未验证服务端与 API Key，且缺少应用内重新配置入口。
- ⚠ apps/tv：侧栏、播放器信息层和诊断页尚未形成确定性焦点交接与恢复。
- ⚠ apps/tv：LivePlaybackViewModel 仍直接依赖 data 层 LastChannelStore 和 Android Context。
- ⚠ apps/tv：播放决策异常存在吞错路径，错误恢复动作不完整。
- ⚠ apps/tv：API Key 当前存于普通 Preferences DataStore，尚未加密。
- ⚠ apps/tv：存在未接入现行导航的旧 EPG/Player/Navigation 代码。

修订简史：
- 1.0.0（2026-07-07）：初始采纳，六大核心原则。
- 1.1.0（2026-07-20）：新增原则 VII（可观测性）。
- 2.0.0（2026-07-20）：Web UI 栈替换为 antd v6。
- 2.1.0（2026-07-20）：新增 antd CLI 查询与 lint 流程。
- 2.2.0（2026-07-20）：新增 antd v6 视觉语言约束。
- 3.0.0（2026-07-30）：Android TV 成为一等客户端，建立跨语言契约与 TV 体验约束。
-->

# MAGI 项目宪法

## 核心原则

### I. 整洁架构（分层）

后端（API 与 Worker）必须遵循严格的分层设计：

```txt
HTTP/Controller → Application/UseCase → Domain → Infrastructure/Repository → Database
```

- 依赖只能向下流动。下层禁止从上层导入。
- **Controller**（`http/`）：参数校验、DTO 转换、响应塑形。禁止包含业务逻辑或数据库调用。
- **Application / UseCase**（`application/`）：业务编排、事务控制、权限校验。每个业务动作对应一个 UseCase。禁止包含 SQL 或 ORM 特定代码。
- **Domain**（`domain/`）：业务规则、状态流转、不变式（例如"频道在……情况下不能删除"、"节目不允许时间重叠"）。
- **Infrastructure**（`infrastructure/`）：技术实现（Drizzle、Redis、BullMQ、XML 解析器等）。

**理由**：长期由单人维护的项目承受不起分层腐化。严格分层能让未来的你替换 Drizzle、NestJS 或 BullMQ 时不动业务规则。

Android TV 必须遵循：

```txt
Compose UI / ViewModel → UseCase / Domain Port → Data or Platform Implementation
```

- `domain/` 禁止导入 Android、Compose、Media3、Retrofit 或 DataStore。
- `ui/` 和 ViewModel 禁止直接依赖 `data/` 的具体实现。
- 播放器、设备能力、凭据存储和最后频道存储必须经由 domain/application
  接口或 UseCase 暴露。
- Composable 只渲染 `UiState` 并发送用户意图；禁止直接探测 MediaCodec、
  发网络请求或构造用于驱动播放器的伪领域对象。

### II. 单仓多包（Monorepo with Shared Packages）

仓库采用 Turborepo + pnpm workspace，包含两棵顶层目录树：

- `apps/` — 可部署应用：`web`、`api`、`worker`、`tv`。
- `packages/` — 共享代码：`types`、`ui`、`utils`、`backend-core`、`tsconfig`。

规则：

- TypeScript 应用之间共享的 DTO、枚举、值对象（VO）与 Zod schema 必须在
  `packages/types` 中定义唯一一次。
- Kotlin Android TV 客户端不得直接复制 TypeScript 类型作为第二真相源；跨语言 API
  契约以 `/api/open.json` 的 OpenAPI 文档为准。Kotlin DTO 必须由契约生成，或由
  契约测试验证字段、可空性和枚举兼容性。
- TypeScript app 之间的代码复用必须通过 `packages/*`；`apps/tv` 通过 HTTP/OpenAPI
  边界协作。禁止 app 之间直接导入源码。
- `apps/tv` 是独立 Gradle 工程，不进入 pnpm/turbo 构建图；其质量门槛必须由 Gradle
  命令独立执行。
- 新 package 必须有清晰、单一的职责；仅作组织用途的 package（只是一个空文件夹）是不允许的。

**理由**：前后端共享同一份契约源真相，杜绝"web 与 api 之间类型漂移"的失败模式。

### III. 领域独立

`domain/` 层禁止依赖：

- 框架（NestJS、Express、React 等）。
- ORM 或数据库客户端（Drizzle、pg、Knex）。
- 基础设施相关（Redis、BullMQ、文件系统）。

Repository 以接口形式暴露在 application/domain 层；其具体实现位于 `infrastructure/`。UseCase 依赖接口，不依赖 Drizzle 类。

**理由**：业务规则是价值最高、变更频率最低的代码。它们必须能在任何框架或厂商被替换后存活下来。

### IV. 重活优先异步

长时间运行的操作必须通过 BullMQ 卸载到 Worker。API 必须立即返回一个 Task 句柄；客户端轮询 `GET /tasks/:id` 获取状态。

强制异步的典型场景：

- XMLTV / M3U 源导入与解析
- 源同步、定时刷新、可用性检查
- 流探测与批量流检查
- EPG 匹配与 EPG 刷新

Worker 镜像 API 的分层架构（`application/`、`domain/`、`infrastructure/`）。

**理由**：单个 XMLTV 源导入可能耗时数分钟。阻塞 API 请求会拖累每个用户的管理后台，并可能触发代理超时。

### V. 端到端契约与类型安全

TypeScript workspace 强制使用 TypeScript；Android TV 强制使用 Kotlin。规则：

- 禁止使用 `any`，若必须使用须在行内注释说明理由。优先使用 `unknown` + 类型收窄。
- Zod schema 是唯一真相源；TypeScript 类型通过 `z.infer<typeof Schema>` 推导，禁止手写并行接口。
- API 契约变更必须先改 `packages/types`，再由 `apps/api` 与 `apps/web` 消费。
- 开放 API 契约变更必须同步更新 OpenAPI，并验证 Android TV 对新增字段、可空字段和
  枚举值的前后兼容性；禁止仅修改 Retrofit DTO 而不更新服务端契约。
- Kotlin 禁止无理由的 `!!`、无类型字符串错误和把网络 DTO 直接暴露给 UI；DTO 必须在
  data 层映射为 domain model。
- 合并前 `eslint` 与 `tsc --noEmit` 必须通过。

**理由**：编译期发现契约漂移的成本约为线上 500 错误被触发后再修复的千分之一。

### VI. 长期可维护性（对单人开发者友好）

MAGI 主要由一人维护。代码必须为"六个月后的你"优化，而不是为了炫技。

- **YAGNI**：不要为假想的未来需求预先建设。只有当第三个具体用例出现时，才引入抽象。
- 优先删除而非抽象。三行相似代码胜过一个过早的泛型助手。
- 注释解释"为什么"，不解释"是什么"。命名良好的标识符本身就在回答"是什么"。
- 每个特性都应能在 `docs/` 或一份 spec 中用一段话说清楚；如果说不清，说明设计过于复杂。

**理由**：单人维护者没有团队可以帮忙反向追溯过去的决策。简洁会复利，炫技会衰减。

### VII. 可观测性（结构化 + 链路追踪）

API 与 Worker 必须输出结构化、机器可解析、且能跨 API → Worker 边界追踪的日志。对于大部分重活都异步执行的系统而言，日志是最主要的诊断入口。

- **结构化日志**：必须输出 JSON，至少包含 `timestamp`、`level`、`logger`、`message`，以及相关上下文（`taskId`、`sourceId`、`channelId`）。在 `apps/api` 与 `apps/worker` 中，除顶层 bootstrap 外禁止使用 `console.log` / `console.error`。
- **链路 ID**：每个 HTTP 请求必须携带（或自动生成）`x-request-id`。当 API 将任务投递到 BullMQ 时，Worker 在该任务的日志上下文中必须同时包含原始 request ID 与 BullMQ job ID。
- **任务生命周期日志**：BullMQ job 必须在 `start`、`success`、`failure`（包含 `error.stack`）、`retry` 四个时机打日志。进度应在粗粒度里程碑（如每 10% 或每 1000 行）打点，而不是逐行打点。
- **日志级别**：`error` = 不可恢复的失败；`warn` = 可恢复的异常；`info` = 生命周期事件；`debug` = 冗余诊断信息。生产环境默认级别必须为 `info`。
- **敏感信息脱敏**：密码、token、`Authorization` 头、refresh cookie 禁止出现在日志中。日志助手在序列化之前必须对已知的敏感键进行脱敏。
- **未来引入追踪**：当引入 OpenTelemetry（或同类方案）时，span 必须沿用日志上下文中相同的链路 ID。

**理由**：单次 XMLTV 导入跨越 API 投递 → Worker 处理 → DB 写入，耗时可达数分钟。如果没有结构化日志与一条贯穿 HTTP 请求与 BullMQ job 的链路 ID，"凌晨 3 点源 X 为什么失败了？"就只能靠猜。事后补可观测性的成本约为一开始就做好的 10 倍。

### VIII. Android TV 遥控器优先与播放可靠性

Android TV 是 MAGI 的正式消费端，不是 Web 页面的电视适配版。任何 TV 功能必须满足：

- **D-pad 完整可达**：核心流程必须只用方向键、OK 和 Back 完成。禁止依赖触摸、鼠标、
  隐藏手势或不可发现的长按。新增可交互元素必须定义进入、退出、返回和焦点恢复路径。
- **确定性焦点**：打开侧栏、弹层或新页面时必须显式设置初始焦点；关闭后必须恢复到
  触发元素或播放器。当前播放项必须滚动可见。禁止把行为交给不稳定的默认空间寻焦。
- **Back 层级固定**：Back 必须按“最上层弹层/侧栏 → 信息层 → 上一页面 → 退出应用”
  逐层消费。任一错误状态不得把“退出应用”作为唯一恢复动作。
- **播放器单一所有者**：Media3/ExoPlayer 必须由生命周期明确的 platform 实现持有。
  换台复用播放器；并发换台必须可取消或序列化，旧请求与旧回调不得覆盖新频道状态。
- **显式播放状态**：加载、解析线路、缓冲、首帧、切换线路、可恢复错误、终止错误必须是
  明确状态。禁止吞异常、无限 loading 或通过伪造空领域对象触发错误 UI。
- **可恢复配置**：保存服务器地址和 API Key 前必须验证连接与鉴权。已配置应用必须始终
  提供重新配置入口；网络、401、无线路和解码失败必须提供与原因匹配的重试或恢复动作。
- **凭据保护**：API Key 必须使用 Android Keystore 支持的加密存储；日志、诊断、崩溃
  信息和 UI 截图不得包含明文 Key 或完整播放地址。
- **10-foot UI**：关键正文不得小于 16sp，辅助正文不得小于 14sp；更小字号仅限非关键
  标签并须在设计评审中说明。可交互目标最小 48dp，必须保留 TV 安全区。焦点状态不得
  只依赖颜色，必须同时具备轮廓、缩放、明度或其他远距离可辨识反馈。
- **实机验收**：改变焦点、Back、换台、播放器或覆盖层的功能，除单元/集成测试外，必须
  在 Android TV 模拟器和至少一台真实遥控器设备上验证。验收记录必须包含快速连续换台、
  侧栏开关、线路故障切换、断网、401 和应用恢复。

**理由**：TV 的主要失败模式不是页面无法渲染，而是焦点丢失、遥控器不可达、播放器竞态
和错误后无法恢复。这些问题只能通过架构边界、确定性状态机与实机门槛共同约束。

## 技术栈标准

技术栈是固定的。替换需要宪法修正。

| 层级 | 必选技术 |
|-------|---------------------|
| 前端框架 | TanStack Start（Vite）、TanStack Router、React 19 |
| 前端 UI / 样式 | antd v6（CSS-in-JS；禁止 TailwindCSS / shadcn） |
| 服务端状态 | TanStack Query、TanStack Table |
| 客户端状态 | Zustand |
| 鉴权 | better-auth（邮箱/密码） |
| 后端框架 | NestJS |
| ORM | Drizzle ORM |
| 数据库 | PostgreSQL |
| 缓存 / 队列 | Redis、BullMQ |
| 校验 | Zod |
| 构建 / 仓库 | Turborepo、pnpm（Node ≥ 20） |
| Android TV | Kotlin、Jetpack Compose for TV、Media3/ExoPlayer |
| TV 网络 / 存储 | Retrofit、kotlinx.serialization、DataStore + Android Keystore |
| TV 构建 | Gradle、Android Gradle Plugin、JDK 17+ |
| 部署 | Docker、Docker Compose |

- 新增运行时依赖必须在 PR 描述中说明理由（为什么现有依赖无法胜任）。
- 前端 UI 一律走 antd v6；禁止再引入 TailwindCSS、shadcn/ui、radix-ui 或同类 utility-first / 复制源码型 UI 框架（见同步影响报告中的迁移待办）。
- `package.json` 的 scripts 保持精简；Docker 与基础设施初始化逻辑放在 `scripts/*.sh`。

## 开发流程与质量门槛

- **本地启动**：`bash scripts/init-dev.sh` 是拉起 PostgreSQL + Redis、执行迁移、初始化 admin 用户的官方途径。手动 `docker run` 流程不得与此脚本产生分叉。
- **Schema 变更**：任何对 Drizzle schema 的修改必须配套 `db:generate` + `db:migrate` 产出的迁移文件，并在同一个 PR 中提交。
- **质量门槛（合并前必须通过）**：
  - `pnpm lint`
  - `pnpm build`
  - 每个包的 `tsc --noEmit`
- **Android TV 质量门槛（涉及 `apps/tv` 时必须通过）**：
  - `cd apps/tv && ./gradlew :app:lintDebug`
  - `cd apps/tv && ./gradlew :app:testDebugUnitTest`
  - `cd apps/tv && ./gradlew :app:assembleDebug`
  - 涉及焦点、Back、播放器或覆盖层时，PR/spec 验收记录必须列出模拟器与真实设备结果；
    仅截图或鼠标操作不算通过。
- **TV spec 门槛**：任何影响 `apps/tv` 的非平凡特性，spec 必须列出 D-pad 焦点图、
  Back 层级、加载/空/错误/重试状态、10-foot UI 指标和播放生命周期影响。缺失任一项时
  不得进入实现。
- **提交规范**：Conventional Commits（`feat:`、`fix:`、`chore:`、`docs:`、`refactor:`）。允许 scope（如 `feat(api): …`）。
- **Spec 优先**：非平凡特性应先在 `.specify/specs/<feature>/` 下产出一份 spec。琐碎修复可以跳过。
- **测试**：新增测试时遵循 Red-Green-Refactor — 先写失败的测试，再写实现。测试与源码同目录或镜像在 `tests/` 下，与所覆盖的层级对应。
- **可观测性**：新增的接口与 BullMQ job 必须从第一天起就带上结构化日志与链路 ID 透传（见原则 VII）。不允许"以后再补"。
- **antd UI 编写流程（强制）**：编写任何 antd UI 代码（组件、props、token、demo 复制、主题配置、ProComponents、icons）之前必须先通过 `@ant-design/cli`（命令名 `antd`，全局已装）查询，**不要依赖记忆**。流程：
  1. `antd info <Component> --format json --version 6.x` —— 看可用 props / 类型 / 默认值。
  2. `antd demo <Component> basic --format json` —— 拿可运行 demo 作起点。
  3. 写代码（如需自定义样式：`antd semantic <Component>` 拿 classNames 结构；如需 theming：`antd token <Component>` 拿 token）。
  4. `antd lint <path> --format json` —— 检查废弃用法与最佳实践违规。

  涉及版本迁移时先用 `antd migrate 5 6 --apply ./src` 生成迁移提示。**理由**：antd v6 与训练数据中的 v4/v5 存在破坏性变更（组件 API、token 命名、文件结构），凭记忆写出的代码会出现编译失败或运行时废弃警告。本条同样适用于人类协作者：手动编写 antd 代码时也应先查官方文档（<https://ant.design/docs/react/for-agents-cn>）。
- **antd 视觉语言遵循（强制）**：编写任何 antd UI（自定义组件、布局、间距、颜色、动效、theme 配置）之前，必须先读 `antd design.md --format json`（或在线 <https://ant.design/design.md>），按 Ant Design v6 视觉语言决策。关键约束摘录：
  - **四大价值观**：Natural（自然）/ Certain（确定）/ Meaningful（有意义）/ Growing（可生长）—— 任何视觉冲突按这四字裁决。
  - **颜色**：主色 `#1677FF` + 4 语义色（success `#52C41A` / warning `#FAAD14` / error `#FF4D4F` / info `#1677FF`）；中性文字用 `rgba(0,0,0,α)` 4 档（0.88 / 0.65 / 0.45 / 0.25）；三层 surface（`bg-layout #F5F5F5` / `bg-container #FFFFFF` / `bg-elevated #FFFFFF` 用阴影区分）—— **禁止硬编码 `#FFFFFF` 或 `#FAFAFA`**，必须读 token。
  - **排版**：基础字号 **14px**（不是 16，企业 console 优先密度）；只用两个字重 400（正文）/ 600（标题）；不用 thin (100–300) / bold (700+) / italic（除长文档）。
  - **4px 网格**：spacing scale 4 / 4 / 8 / 16 / 24 / 32 px —— **禁止 magic number**（`padding: 11px`、`gap: 13px`）。
  - **圆角**：默认 6px；Controls 6px / Surfaces 8px / Tags·Tooltip 4px；`rounded.full`（9999px）只用于 avatar / badge / dot，不用于 button / tag；相邻元素圆角必须协调。
  - **动效**：3 档时长（Fast 0.1s / Mid 0.2s / Slow 0.3s）+ 预定义 easing（`motionEaseInOut` 等）—— **禁止自定义 `cubic-bezier`**。
  - **Do's & Don'ts**：每屏只一个 primary button；preset 色板（`blue`~`lime`）只用于 tag / chart，不用于主 UI affordance；禁止绕过 token / algorithm / `theme.components` / CSS variables 自定义 CSS。

  **理由**：design.md 是 antd v6 默认 Light 主题的视觉契约，定义了颜色推导规则、4px 网格、三层 surface 模型、flat-first elevation、动效 token、组件原型（component archetypes）。绕过这些（硬编码 hex、用 16px 字号、堆两个 primary button、自定义 cubic-bezier）会让 UI 失去 antd 的 "Natural / Certain" 质感，并阻断未来 dark mode / theme switching 的算法推导。

## 治理

- 本宪法是架构与代码风格争议的**最高权威**。当 `README.md`、`docs/architecture.md` 或任何其他文档与本文档冲突时，**以宪法为准** — 冲突的文档必须被更新以对齐。
- **修正案**须满足：
  1. 在 PR 描述中给出书面理由。
  2. 在本文件顶部更新**同步影响报告**。
  3. 对 `CONSTITUTION_VERSION` 做一次 semver bump（按下方规则选 MAJOR/MINOR/PATCH）。
- **版本策略**：
  - **MAJOR**：删除原则或从根本上重新定义；不向后兼容的治理变更。
  - **MINOR**：新增原则或实质性扩展已有指导。
  - **PATCH**：澄清、措辞、错别字、不影响语义的修订。
- **合规评审**：每个 PR 评审都必须隐式检查本次变更是否违反本文件中的任何原则。若违反是有意为之（被论证过的复杂度），必须在 plan 的"复杂度追踪"章节中记录。
- **运行时开发指引**：环境搭建参考 `README.md`；分层与路由细节参考 `docs/architecture.md`；进行中的特性 spec 参考 `.specify/specs/<feature>/`。

**版本**：3.0.0 | **批准日期**：2026-07-07 | **最近修订**：2026-07-30
