<!--
同步影响报告
==================
版本变更：2.1.0 → 2.2.0
- MINOR（次版本）：进一步扩展 antd 指导 —— 新增"编写 antd UI 前必须读 design.md，按 Ant Design v6 视觉语言决策"的硬性约束。
  理由判定为 MINOR：未删除/重定义任何核心原则，也未新增原则，但为 v2.1.0 的 API 查询流程补充了视觉语言层面的具体要求（materially expanded guidance）。

本次变更：
- 章节"开发流程与质量门槛"新增 bullet"antd 视觉语言遵循（强制）"，摘录 design.md 的核心约束（四大价值观 / 颜色 / 排版 / 4px 网格 / 圆角 / 动效 / Do's & Don'ts）。
- 配套查询命令：`antd design.md --format json`（离线毫秒级，已随 @ant-design/cli v6.5.1 提供）；在线副本 <https://ant.design/design.md>。

未变更：
- 核心原则 I–VII 不变。
- 技术栈标准不变（v2.0.0 锁定的 antd v6 保持）。
- v2.1.0 的 "antd UI 编写流程（强制）" 不变 —— 与本次新增的"antd 视觉语言遵循"并列，前者管 API、后者管视觉决策。

v2.0.0 遗留的迁移待办（**仍须在迁移 PR 中处理，否则视为违反宪法**）：
- ⚠ packages/ui：删除 shadcn 相关依赖（radix-ui、class-variance-authority、clsx、tailwind-merge、lucide-react、next-themes、sonner、vaul、tailwindcss 等），重写 src/components/ 下所有组件为 antd。
- ⚠ packages/ui/components.json 与 apps/web/components.json：删除（shadcn CLI 配置）。
- ⚠ apps/web/package.json：移除 @tailwindcss/vite、tailwindcss；新增 antd v6。
- ⚠ apps/web/vite.config.ts：移除 @tailwindcss/vite 插件；按 antd v6 推荐配置。
- ⚠ apps/web 入口与全局样式：移除 Tailwind preflight / @import "tailwindcss"；改为 antd 的 App / ConfigProvider 包裹 + 必要的全局 reset。
- ⚠ README.md：更新技术栈说明（移除 Tailwind/shadcn 字样）。
- ⚠ docs/architecture.md：更新前端栈描述与组件库选型理由。
- ⚠ 既有 packages/ui/src/styles/globals.css、site-header.tsx、app-sidebar.tsx、sidebar.tsx 等：评估保留 / 重写 / 删除。

需要更新的模板：
- ✅ .specify/templates/plan-template.md — Constitution Check 章节为通用占位；新约束在 plan 评审阶段强制执行，无需修改。
- ✅ .specify/templates/spec-template.md — 通用模板；无需修改。
- ✅ .specify/templates/tasks-template.md — 通用模板；无需修改。
- ✅ .specify/templates/checklist-template.md — 通用模板；无需修改。

修订简史：
- 1.0.0（2026-07-07）：初始采纳，六大核心原则 + 技术栈 + 开发流程 + 治理。
- 1.1.0（2026-07-07 → 2026-07-20 修订）：新增核心原则 VII（可观测性）。
- 2.0.0（2026-07-20）：前端 UI 栈根本替换 —— TailwindCSS 4 + shadcn/ui → antd v6。
- 2.1.0（2026-07-20）：扩展 antd 指导 —— 编写 antd UI 代码前必须先通过 @ant-design/cli 查询，写完必须 lint。
- 2.2.0（2026-07-20）：进一步扩展 antd 指导 —— 编写 antd UI 前必须读 design.md，按 Ant Design v6 视觉语言决策（颜色/排版/4px 网格/圆角/动效）。
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

### II. 单仓多包（Monorepo with Shared Packages）

仓库采用 Turborepo + pnpm workspace，包含两棵顶层目录树：

- `apps/` — 可部署应用：`web`、`api`、`worker`、`tv`。
- `packages/` — 共享代码：`types`、`ui`、`utils`、`backend-core`、`tsconfig`。

规则：

- DTO、枚举、值对象（VO）与 Zod schema 必须在 `packages/types` 中定义唯一一次，由各 app 引入。跨 app 重复定义类型是被禁止的。
- 跨 app 的代码复用必须通过 `packages/*`，禁止 app 之间直接相互导入。
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

### V. 端到端类型安全

整个 monorepo 强制使用 TypeScript。规则：

- 禁止使用 `any`，若必须使用须在行内注释说明理由。优先使用 `unknown` + 类型收窄。
- Zod schema 是唯一真相源；TypeScript 类型通过 `z.infer<typeof Schema>` 推导，禁止手写并行接口。
- API 契约变更必须先改 `packages/types`，再由 `apps/api` 与 `apps/web` 消费。
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

**版本**：2.2.0 | **批准日期**：2026-07-07 | **最近修订**：2026-07-20
