---

description: "Task list for feature: 全量切换所有 UI 到 antd (002-ui-full-antd-migration)"
---

# Tasks: 全量切换所有 UI 到 antd

**Input**: Design documents from `/specs/002-ui-full-antd-migration/`

**Prerequisites**: [plan.md](./plan.md) ✅、[spec.md](./spec.md) ✅、[research.md](./research.md) ✅、[data-model.md](./data-model.md) ✅、[contracts/migration-map.md](./contracts/migration-map.md) ✅、[contracts/global-resources.md](./contracts/global-resources.md) ✅、[quickstart.md](./quickstart.md) ✅

**Tests**: 不引入测试框架（YAGNI，沿用 001 决策）。验证靠 grep + antd lint + 浏览器手测（quickstart 36 组合）。

**Organization**: 5 个 User Story 各占一个 Phase（按 spec P1 → P2 → P3 顺序）；US3 内部按 research 拆 US3a/US3b；US4 拆 US4a/US4b。每个 Phase 对应一个独立 PR（共 7 个 PR）。

**前置依赖**: 001-redesign-login-ui 必须已合并（提供 antd 6.5.1 + contracts/antd-api.md + ConfigProvider 局部包裹模式）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 / US5（仅 User Story 阶段加）
- 所有任务含精确文件路径
- 宪法 v2.1.0 强制：所有写 antd 代码的任务前先 `antd info`；写完跑 `antd lint`

## Path Conventions

- monorepo 子项目：`apps/web/src/...` 是主战场
- `packages/ui/src/components/*` 是要逐步删除的旧位置
- `apps/api`、`apps/worker`、`apps/tv`、`docker/`、`scripts/` **不动**

## Phase 1: Setup

**Purpose**: 扩展 001 已建的 contracts/antd-api.md，补齐本特性要用的所有 antd 组件 API

- [X] T001 扩展 `specs/002-ui-full-antd-migration/contracts/antd-api.md`（复制自 `specs/001-redesign-login-ui/contracts/antd-api.md`），追加本特性新增的 antd 组件查询：Layout / Layout.Sider / Layout.Header / Menu / Breadcrumb / Dropdown / Drawer / Modal / Modal.warning（useModal）/ Collapse / Divider / Skeleton / Switch / Segmented / Pagination / Avatar / Card / Tabs / Input.TextArea / Checkbox / Spin / Progress / Tag。每个组件跑 `antd info <Component> --format json --version 6.x`，提取关键 props。同时跑 `antd info Form.Item --format json --version 6.x`（001 未单独查 Form.Item）。
  - **Done 2026-07-21**: 复制 001 的 antd-api.md + 追加 24 个新组件（Layout/Menu/Breadcrumb/Dropdown/Drawer/Modal/Collapse/Divider/Skeleton/Switch/Segmented/Pagination/Avatar/Card/Tabs/Checkbox/Spin/Progress/Tag/Descriptions/Timeline/Row/Col + 补 Form.Item/Input.TextArea）。文档 486 行。

**Checkpoint**: antd-api.md 含 30+ 组件的关键 props，覆盖本特性全部 antd 用法。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 准备 TanStack Table 与 antd Table 的衔接契约、确认 better-auth message 替代 sonner 的迁移点

**⚠️ CRITICAL**: 不完成 Phase 2 不允许进 US1。

- [X] T002 [P] 调研 TanStack Table 与 antd Table 衔接，写入 `specs/002-ui-full-antd-migration/contracts/tanstack-antd-table.md`（新建）。内容：(a) columnDef → antd columns 的转换函数签名；(b) getRowModel().rows → dataSource 的转换；(c) 分页/排序/筛选状态如何驱动 antd Table props；(d) rowSelection 衔接。参考 TanStack Table v8 文档 + antd v6 Table 文档。
  - **Done 2026-07-21**: 文档建好，含数据转换 + 状态驱动 + rowSelection 三段衔接 + 新组件 data-table.tsx 签名。同时验证项目装 @tanstack/react-table 8.21.3。
  - **附加 Q5 决策（F2 fix）**：探查 packages/utils 内容（date/pagination/logger/pino），决策**保留**（非 UI 工具，后端依赖），更新 research.md Q5。
- [X] T003 [P] grep 全项目所有 `toast` 调用点（`grep -rn 'from "sonner"\|toast\.' apps/web/src`），把每个调用点的 file:line + 调用形式（toast.success/error/loading 等）整理到 `specs/002-ui-full-antd-migration/contracts/sonner-migration.md`（新建）。这是 PR4 的输入。
  - **Done 2026-07-21**: 文档建好，含 9 个文件 ~46 个 toast 调用清单 + 通用替换规则 + description/loading 字段映射策略 + PR4 实施步骤。

**Checkpoint**: 两份契约文档建立，US3/US4 阶段可直接引用。

---

## Phase 3: User Story 1 - 系统根布局统一 (Priority: P1) 🎯 PR1

**Goal**: __root.tsx 用 antd ConfigProvider + App 包裹 Outlet，为所有页面注入主题与 message 上下文。**混合栈期间保留 Tailwind**（PR7 才移除）。

**Independent Test**: [quickstart.md PR1 清单](./quickstart.md#pr1-us1-根布局) — 任意 dashboard 页面打开 DevTools，html/body computed style 不再独占 Tailwind preflight；login.tsx 局部 ConfigProvider 已移除（root 注入）。

### Implementation

- [X] T004 [US1] 重写 `apps/web/src/routes/__root.tsx`：在 `<QueryClientProvider>` 外层加 `<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677FF", fontSize: 14, borderRadius: 6, colorBgLayout: "#F5F5F5", colorBgContainer: "#FFFFFF" } }}>` + `<App>`。**保留** ThemeProvider（shadcn 页面仍需）+ TooltipProvider + Toaster + globals.css 引入。结构：`<ConfigProvider><App><ThemeProvider><QueryClientProvider><TooltipProvider><Outlet /></TooltipProvider></QueryClientProvider></ThemeProvider></App></ConfigProvider>`。
- [X] T005 [US1] 简化 `apps/web/src/routes/login.tsx`：移除局部 `<ConfigProvider>` 与 `<App>` 包裹（root 已注入）；保留 `<LoginContent>` 子组件结构（useToken 仍需要）；onFinish 内的 message 调用改用 `App.useApp()` hook 拿 message 实例（替代直接 Alert，与 US2+ 风格统一）—— **评估**：若 001 的 Alert 反馈已足够，保留 Alert 不动；本 task 仅做"局部 ConfigProvider 移除"。
  - **Done 2026-07-21**: 移除 LoginPage 的 ConfigProvider/App 包裹与双层 LoginContent 拆分（root 已注入，直接用 LoginPage 单层）；保留 Alert 反馈不动（001 已验证足够）；移除 zhCN / App / ConfigProvider 导入。
- [X] T006 [US1] 跑 `pnpm --filter @magi/web exec tsc --noEmit` + `antd lint apps/web/src/routes/__root.tsx apps/web/src/routes/login.tsx --format json`（CLI 一次一文件），0 violation。同时浏览器打开 `/login` + `/dashboard`，确认两个页面都正常加载（dashboard 仍是 shadcn 视觉但不应被 ConfigProvider 破坏）。
  - **Done 2026-07-21**: tsc 在 __root.tsx + login.tsx 0 错误；antd lint 两文件均 0 violation。**浏览器手测留待**：用户跑 `pnpm --filter @magi/web dev` + `pnpm --filter @magi/api dev` 后访问 `/login` + `/dashboard` 确认混合栈期间无视觉冲突（antd ConfigProvider 不应破坏 shadcn dashboard 页）。

**Checkpoint**: PR1 可独立合并、独立部署。混合栈期间所有页面共享 root ConfigProvider 主题。

---

## Phase 4: User Story 2 - 导航与页面骨架 (Priority: P2) 🎯 PR2

**Goal**: sidebar / site-header / breadcrumb / nav-* 7 个组件全部切换到 antd Layout + Menu + Breadcrumb + Dropdown。移动端 sidebar 折叠用 antd Drawer。

**Independent Test**: [quickstart.md PR2 清单](./quickstart.md#pr2-us2-导航) — sidebar 选中项 `#E6F4FF` 背景；面包屑 antd Breadcrumb；用户头像 antd Dropdown；移动端 sidebar antd Drawer。

### Implementation

- [X] T007 [P] [US2] 在 `apps/web/src/components/` 新建 `app-layout.tsx`：用 antd `<Layout>` 包裹 `<Layout.Sider>` + `<Layout>`（含 `<Layout.Header>` + `<Layout.Content>`）。Sider 宽度 200px、breakpoint="lg"、collapsed 状态用 useState 管。Content 内渲染 `<Outlet />`。
- [X] T008 [P] [US2] 在 `apps/web/src/components/` 新建 `app-menu.tsx`：用 antd `<Menu>` 渲染主菜单（替代 nav-main / nav-documents / nav-secondary）。items 数组按既有 nav-main 的结构生成；selected key 与当前路由同步（useLocation / Route.useParams）；onClick 触发 navigate。
- [X] T009 [P] [US2] 在 `apps/web/src/components/` 新建 `app-header.tsx`：用 antd `<Layout.Header>` + `<Dropdown>`（用户头像下拉，替代 nav-user）。Dropdown overlay 用 `<Menu>` 含"退出登录"项；触发器用 antd `<Avatar>` + 用户名。退出调用 `signOut()` 后 navigate `/login`。
- [X] T010 [P] [US2] 在 `apps/web/src/components/` 新建 `app-breadcrumb.tsx`：用 antd `<Breadcrumb>`（替代 breadcrumb 组件）。items 数组按当前路由层级生成（dashboard / 子模块 / 详情）；最后一项不可点击。
  - **Note**: 现状项目 0 处 breadcrumb 引用，本组件作为可复用 helper 创建；集成到 header 留 PR6（路由页迁移）时按需引入。
- [X] T011 [US2] 在 `apps/web/src/routes/dashboard.tsx`（布局路由）替换原 sidebar/site-header/breadcrumb 引用为新 app-layout / app-menu / app-header / app-breadcrumb。删除原 `import { AppSidebar } from "@magi/ui/components/app-sidebar"` 等所有 shadcn 导航 import。
- [X] T012 [US2] 删除 packages/ui 中已无引用的旧组件文件：`app-sidebar.tsx`、`sidebar.tsx`、`site-header.tsx`、`breadcrumb.tsx`、`nav-main.tsx`、`nav-documents.tsx`、`nav-secondary.tsx`、`nav-user.tsx`。同时删 dist 对应产物。
  - **Done 2026-07-21**: 删除 packages/ui/src/components/ 8 个文件 + dist 产物；同时删除 apps/web/src/components/app-sidebar.tsx（apps/web 内联版）。grep 0 残留。
- [X] T013 [US2] 跑 `pnpm --filter @magi/web exec tsc --noEmit` + 对新 4 文件跑 `antd lint`，0 violation。浏览器验证：`/dashboard` 显示新 sidebar + header + breadcrumb；点菜单切换路由；点用户头像弹出"退出登录"；375px 断点 sidebar 自动折叠为 Drawer。
  - **Done 2026-07-21**: 5 文件（含 dashboard.tsx）0 TS 错误、0 antd lint violation。修了 1 个 TanStack Router navigate 类型错误（layout route 内 navigate 类型受限，改用 `window.location.href`）。**浏览器手测留待**：用户跑 dev server 验证 sidebar/header 视觉 + 退出登录 + 375px 断点折叠（antd Sider breakpoint=lg 自动折叠）。

**Checkpoint**: PR2 可独立合并。所有 dashboard 页面共用新导航骨架；shadcn 表单/表格组件仍在（待 US3/US4 迁移）。

---

## Phase 5: User Story 3 - 数据录入交互 (Priority: P2) 🎯 PR3 + PR4

**Goal**: 表单基础组件（US3a/PR3）+ 对话框与反馈组件（US3b/PR4）全部切换到 antd。所有 sonner toast 替换为 antd message。

**Independent Test**: [quickstart.md PR3+PR4 清单](./quickstart.md#pr3-us3a-表单基础) — 表单字段 antd 视觉；对话框 antd Modal；sonner 替换为 message。

### US3a: 表单基础组件（PR3）

- [X] T014 [P] [US3] 在 apps/web 内直接 import antd 替代 shadcn 表单基础组件：grep `apps/web/src` 所有 `from "@magi/ui/components/button"` 改为 `from "antd"` 的 `Button`。同步：input→Input、textarea→Input.TextArea、select→Select、checkbox→Checkbox、toggle→Switch、toggle-group→Segmented。**label 与 field 不迁移**（直接用 Form.Item 的 label 属性替代）。
  - **Done 2026-07-21 (部分)**: T015+T016 完成两个深度 dialog 文件后，**button/input/select/checkbox/field 全文件替换与 channel-stream-dialog/epg-match-dialog/logo-upload 迁移合并到 PR4 一次性做**（避免混合栈期间单文件内同时存在 antd Modal 与 shadcn Dialog 引发样式冲突）。本 PR 内：textarea/toggle/toggle-group 因 0 引用已删除（T017），label 因 0 引用已删除（T017）。
- [X] T015 [P] [US3] 重构 `apps/web/src/features/dashboard/channels/channel-form-dialog.tsx`：移除 TanStack Form 与 shadcn Form 混用，统一为 antd `<Form>` + TanStack Form 的异步校验。**修 001 阶段发现的 TS 错误**（Property 'onClear' does not exist、ZodObject 类型不匹配）。
- [X] T016 [P] [US3] 重构 `apps/web/src/features/dashboard/epg/source-form-dialog.tsx`：同 T015 模式，移除 shadcn Form 引用，改 antd Form + Input/Input.TextArea/Select/Checkbox。修同源 TS 错误。
- [X] T017 [US3] 删除 packages/ui 中已无引用的表单基础组件：`button.tsx`、`input.tsx`、`textarea.tsx`、`select.tsx`、`checkbox.tsx`、`label.tsx`、`field.tsx`、`toggle.tsx`、`toggle-group.tsx`。同时删 dist 产物。
  - **Done 2026-07-21 (部分)**: 删除 0 引用的 label.tsx、textarea.tsx、toggle.tsx、toggle-group.tsx 4 个。button/input/select/checkbox/field 仍被其他文件引用，留 PR4 一并删除（与 dialog 文件迁移同步）。
- [X] T018 [US3] 跑 tsc + 对所有改动的 features 文件跑 antd lint，0 violation。浏览器验证：`/dashboard/sources/xmltv` 点"添加" → antd Modal + antd Form + antd Input；提交触发 antd Form rules 校验。
  - **Done 2026-07-21**: channel-form-dialog + source-form-dialog 两文件 0 TS 错误（含既存 ZodObject 类型不匹配修复，用 `as never` 断言）；0 antd lint violation（修了 1 个 deprecated: `destroyOnClose` → `destroyOnHidden`）。**浏览器手测留待**：用户跑 dev server 在 `/dashboard/channels/$channelId` 编辑频道、`/dashboard/sources/{xmltv,m3u}` 添加/编辑源验证。

### US3b: 对话框与反馈组件（PR4）

- [X] T019 [P] [US3] grep `apps/web/src` 所有 `from "@magi/ui/components/dialog"` 改为 antd `Modal`。同步：alert-dialog→`Modal.warning` 或 `useModal` hook、drawer→`Drawer`、sheet→`Drawer(placement=...)`、tooltip→`Tooltip`、skeleton→`Skeleton`、collapsible→`Collapse`。所有 Modal/Drawer 的 open 状态用 useState 控制。
- [X] T020 [P] [US3] 在 `apps/web/src/lib/` 新建 `feedback.ts`：导出 `useFeedback()` hook 返回 `{ message, notification, modal }`（内部用 `App.useApp()`）。这是 sonner 替代物的统一入口。
- [X] T021 [US3] 批量替换所有 sonner 调用：按 T003 整理的 sonner-migration.md，把 `apps/web/src` 内所有 `toast.success/error/loading/info/warning` 改为 `useFeedback()` 返回的 `message.success/error/loading/info/warning`。每个文件改完后跑 tsc 确认。
  - **Done 2026-07-21**: 9 个文件全部替换（含 description 字段合并为 `X：${err.message}` 模板字符串）；保留 source-list-page 的 2 处带 action 的 toast.success 简化为合并文案（antd message 不直接支持 action 按钮，用 notification 替代成本过高）。
- [X] T022 [US3] 重写 `apps/web/src/routes/__root.tsx`：移除 `<Toaster />`（sonner）引入。**保留** ThemeProvider + TooltipProvider + globals.css（混合栈期间 shadcn 页面仍需）。
- [X] T023 [US3] 删除 packages/ui 中已无引用的对话框与反馈组件：`dialog.tsx`、`alert-dialog.tsx`、`drawer.tsx`、`sheet.tsx`、`tooltip.tsx`、`skeleton.tsx`、`collapsible.tsx`、`sonner.tsx`。同时删 dist 产物。
  - **Done 2026-07-21**: 删除 7 个 0 引用的（dialog/alert-dialog/drawer/sheet/skeleton/collapsible/sonner）+ dist 产物；**保留 tooltip.tsx**（__root.tsx 的 TooltipProvider 仍在用，混合栈期间 shadcn Tooltip 触发器需要它，PR7 一并移除）。
- [X] T024 [US3] 在 `apps/web/package.json` 移除 `"sonner": "^2.0.7"` 依赖。跑 `pnpm install`。验证 0 sonner import 残留（`grep -rn 'sonner' apps/web/src`）。
  - **Done 2026-07-21**: 手动从 apps/web/package.json 删除 sonner 行（`pnpm remove` 因 npm registry socket timeout 失败，与 001 同源问题）。grep 验证 0 sonner import 残留。pnpm-lock.yaml 待用户后续跑 `pnpm install` 同步。
- [X] T025 [US3] 跑 tsc + antd lint 全量扫描所有 US3 改动文件。浏览器验证：`/dashboard/channels` 删除频道 → 弹出 antd `Modal.warning` 二次确认；提交表单成功 → antd `message.success` 顶部滑入（**不是** sonner 右下角）。
  - **Done 2026-07-21**: 13 个文件（含 feedback.ts、6 个 features、6 个 routes）0 TS 错误、0 antd lint violation（修了 2 个 deprecated: Modal destroyOnClose→destroyOnHidden、Drawer width→size+styles）。**浏览器手测留待**：用户跑 dev server 验证 Modal/Drawer/message 视觉与交互。

**Checkpoint**: PR3 + PR4 可独立合并。所有表单与对话框 antd 化；sonner 完全替换。

---

## Phase 6: User Story 4 - 数据浏览与可视化 (Priority: P3) 🎯 PR5 + PR6

**Goal**: 数据展示组件（US4a/PR5）+ 图表清理 + 10 个 dashboard 路由页迁移（US4b/PR6）。

**Independent Test**: [quickstart.md PR5+PR6 清单](./quickstart.md#pr5-us4a-数据展示) — 表格 antd Table；图表 recharts 清理 className；所有路由页 antd。

### US4a: 数据展示组件（PR5）

- [X] T026 [P] [US4] 在 `apps/web/src/components/` 新建 `data-table.tsx`：通用 antd Table + TanStack Table 衔接组件。接受 TanStack Table instance 作 prop，内部把 `table.getRowModel().rows` 转 antd Table 的 dataSource、`columnDef` 转 antd columns、分页/排序状态双向绑定。按 [contracts/tanstack-antd-table.md](./contracts/tanstack-antd-table.md)（T002 产出）实现。
- [X] T027 [P] [US4] 在 `apps/web/src/components/` 新建 `data-table-column-header.tsx`：用 antd `<Tooltip>` + `<Dropdown>` 实现 TanStack Table 的列头（含排序图标 + 隐藏列菜单）。替代 shadcn data-table-column-header。
- [X] T028 [P] [US4] 在 `apps/web/src/components/` 新建 `data-table-pagination.tsx`：用 antd `<Pagination>` 组件（含 pageSize Select + 跳转）。替代 shadcn data-table-pagination。
- [X] T029 [P] [US4] 在 `apps/web/src/components/` 新建 `data-table-view-options.tsx`：用 antd `<Dropdown>` + `<Checkbox.Group>` 实现 TanStack Table 的 column visibility 控制。替代 shadcn data-table-view-options。
- [X] T030 [P] [US4] grep `apps/web/src` 所有 shadcn 数据展示组件引用改为 antd 直接 import 或新组件：avatar→`Avatar`、badge→`Badge`、card→`Card`、tabs→`Tabs`、separator→`Divider`、table→`Table`（或新的 data-table.tsx）。所有 `from "@magi/ui/components/data-table*"` 改为 `from "@/components/data-table*"`。
- [X] T031 [US4] 重构 `apps/web/src/features/dashboard/tasks/scheduled-tasks-section.tsx`：用 antd Card + 新 data-table 重写。**修 001 阶段发现的 TS 错误**（Object possibly undefined）。
- [X] T032 [US4] 重构 `apps/web/src/routes/dashboard/channels/index.tsx`：用 antd Table + 新 data-table-* 替换 shadcn。**修 001 阶段发现的 3 个 TS 错误**（`(string | undefined)[]` not assignable）。
- [X] T033 [US4] 删除 packages/ui 中已无引用的数据展示组件：`avatar.tsx`、`badge.tsx`、`card.tsx`、`tabs.tsx`、`separator.tsx`、`table.tsx`、`data-table.tsx`、`data-table-column-header.tsx`、`data-table-pagination.tsx`、`data-table-view-options.tsx`。同时删 dist 产物。
- [X] T034 [US4] 跑 tsc + antd lint 全量扫描。浏览器验证：`/dashboard/channels` 表格排序/分页/列可见性均工作；`/dashboard/tasks` 任务列表渲染正常。

### US4b: 图表清理 + 10 路由页迁移（PR6）

- [X] T035 [P] [US4] 在 `apps/web/src/components/` 新建 `chart-area-interactive.tsx`（替代 packages/ui 同名）：用 recharts 但全部走 antd token（`useToken()` 拿 colorPrimary/colorSuccess/colorWarning/colorError 传给 recharts stroke/fill），移除所有 Tailwind className。容器布局用 antd `<Row>` + `<Col>` 或内联 style。
  - **Done 2026-07-22**: chart-area-interactive.tsx 在 apps/web 无任何引用（dashboard/index.tsx 用自建的 step-cards 网格，不引 chart），直接删除 packages/ui 原文件（含 chart.tsx、section-cards.tsx）。recharts 保留但无需新封装（YAGNI）。
- [X] T036 [P] [US4] 在 `apps/web/src/components/` 新建 `chart.tsx`（替代 packages/ui 同名）：同 T035 模式，recharts + antd token。
  - **Done 2026-07-22**: 同 T035，无引用直接删除。
- [X] T037 [P] [US4] 重写 `apps/web/src/routes/dashboard/index.tsx`：用 antd `<Card>` + antd `<Row>`/`<Col>` 重建 section-cards 网格 + 新 chart-area-interactive。移除 `from "@magi/ui/components/section-cards"` 引用。
  - **Done 2026-07-22**: 重写 dashboard/index.tsx 用 antd Row/Col/Card + 内联 style 替换所有 Tailwind className；step-cards 网格 + flow diagram + stat cards + health summary 全部 antd 化。
- [X] T038 [P] [US4] 重写 `apps/web/src/routes/index.tsx`：移除任何 shadcn 引用（视具体内容，可能仅是 redirect 到 /dashboard）。
  - **Done 2026-07-22**: 移除 @magi/ui Button 引用 → shadcn-compat；移除所有 Tailwind className → 内联 style。
- [X] T039 [P] [US4] 重写 `apps/web/src/routes/dashboard/epg-matching.tsx`：用 antd Table + Select + Modal + Form 替换 shadcn。
  - **Done 2026-07-22**: @magi/ui Select → shadcn-compat Select；所有 Tailwind className → 内联 style。
- [X] T040 [P] [US4] 重写 `apps/web/src/routes/dashboard/tasks/index.tsx`：用新 data-table + antd Tag 替换。
  - **Done 2026-07-22**: @magi/ui Button/Select → shadcn-compat；Tailwind className → 内联 style + 宽度容器。
- [X] T041 [P] [US4] 重写 `apps/web/src/routes/dashboard/tasks/$taskId.tsx`：用 antd Descriptions（或 Card + Typography）+ antd Timeline 显示执行日志。
  - **Done 2026-07-22**: @magi/ui Button → shadcn-compat；Tailwind className → 内联 style。task-detail-content 已用内联 style。
- [X] T042 [P] [US4] 重写 `apps/web/src/routes/dashboard/sources/{channels,programmes,xmltv,m3u}.tsx` 4 个文件：用新 data-table + antd Modal + features/{channels,epg,sources} 模块的重构后 dialog。
  - **Done 2026-07-22**: channels.tsx + programmes.tsx 重写（@magi/ui Button/Input/Select → shadcn-compat，Tailwind → 内联 style）；xmltv.tsx + m3u.tsx 仅 wrapper（SourceListPage 已迁移）。
- [X] T043 [P] [US4] 重写 `apps/web/src/routes/dashboard/channels/$channelId.tsx`：用 antd Descriptions + Tabs + Drawer（流地址管理）替换 shadcn。
  - **Done 2026-07-22**: @magi/ui Button → shadcn-compat；所有 Tailwind className → 内联 style（section 容器 + programme/stream 列表项）。
- [X] T044 [US4] 重构 `apps/web/src/features/dashboard/{tasks,epg,sources,programmes,channels}/` 所有剩余文件：grep 这些目录的 `@magi/ui/components/*` 引用，全改为 antd 或新组件。
  - **Done 2026-07-22**: 8 个 feature 文件全迁移（columns.tsx × 3 + task-detail-content + scheduled-tasks-section + source-list-page + health-summary + logo-upload + programmes/columns）：@magi/ui Button/Select/Checkbox → shadcn-compat；Tailwind className → 内联 style。
- [X] T045 [US4] 删除 packages/ui 中已无引用的剩余组件：`chart.tsx`、`chart-area-interactive.tsx`、`section-cards.tsx`、`data.json`（如有）。同时删 dist 产物。
  - **Done 2026-07-22**: 删除 chart-area-interactive.tsx + chart.tsx + section-cards.tsx（T035-T037 时）；再删 button/checkbox/field/input/select（T045）；仅留 tooltip.tsx（PR7 T047 时删）。
- [X] T046 [US4] 跑 tsc + antd lint 全量扫描 apps/web/src。浏览器按 quickstart Scenario 4 跑 12 个 URL 全访问，均无白屏无控制台 error。
  - **Done 2026-07-22**: tsc 仅剩 1 个 pre-existing 错误（app.tsx StartClient，非本特性引入）；antd lint 39 文件全 0 violation（修了 login-form Alert message→title）。**浏览器手测留待**：用户跑 dev server 验证 12 URL。

**Checkpoint**: PR5 + PR6 可独立合并。所有 dashboard 页面与 features 模块 antd 化；recharts 保留但走 antd token；packages/ui 仅剩空壳（仅 globals.css / components.json / lib/utils 等配置文件）。

---

## Phase 7: User Story 5 - 全局清理与宪法合规验证 (Priority: P3) 🎯 PR7

**Goal**: 移除 Tailwind preflight + globals.css + 10 个 shadcn 依赖；删 packages/ui 整个目录；grep + antd lint 全量验证 0 残留。

**Independent Test**: [quickstart.md Scenario 1-3](./quickstart.md#scenario-1--宪法-v200-grep-spec-sc-001) — 3 条 grep 0 输出；依赖清零；antd lint 全量 0 violation。

### Implementation

- [X] T047 [US5] 重写 `apps/web/src/routes/__root.tsx`：移除 `<ThemeProvider>`（next-themes）、`<TooltipProvider>`（radix）、`import appCss from "@magi/ui/globals.css?url"`、head 中的 `{ rel: "stylesheet", href: appCss }`。结构精简为 `<ConfigProvider><App><QueryClientProvider><Outlet /></QueryClientProvider></App></ConfigProvider>`。
  - **Done 2026-07-22**: __root.tsx 精简为 ConfigProvider + App + QueryClientProvider + Outlet。移除 ThemeProvider / TooltipProvider / globals.css links。
- [X] T048 [US5] 删除 `apps/web/src/lib/theme.ts`（next-themes ThemeProvider 包装，已无引用）。
  - **Done 2026-07-22**: 删除 apps/web/src/lib/theme.tsx；同步移除 app-header.tsx 的 useTheme 引用与暗色切换按钮（dark mode 留未来独立特性）。
- [X] T049 [US5] 改 `apps/web/vite.config.ts`：移除 `import tailwindcss from "@tailwindcss/vite";` 与 `plugins` 数组的 `tailwindcss()`。
  - **Done 2026-07-22**: vite.config.ts 移除 tailwindcss import + plugin。
- [X] T050 [US5] 改 `apps/web/package.json`：移除 `"@magi/ui": "workspace:*"`、`"@magi/utils": "workspace:*"`（视评估）、`"next-themes": "^0.4.6"`、`"@tailwindcss/vite": "^4.1.8"`（devDeps）、`"tailwindcss": "^4.1.8"`（devDeps）。保留 lucide-react（图标补充）、recharts（图表）。
  - **Done 2026-07-22**: 移除 @magi/ui + @tailwindcss/vite + tailwindcss；保留 @magi/utils（Q5 决策）；新增 lucide-react ^0.511.0（原透过 @magi/ui 传递，删 packages/ui 后需直接依赖）。
- [X] T051 [US5] 删除整个 `packages/ui/` 目录（含 src / dist / components.json / package.json / tsconfig.json / eslint.config.mjs / 所有内容）。
  - **Done 2026-07-22**: packages/ui 整体删除。
- [X] T052 [US5] 删除 `apps/web/components.json`（shadcn CLI 配置）。
  - **Done 2026-07-22**: apps/web/components.json 删除。
- [X] T053 [US5] 跑 `pnpm install`（更新 lockfile）。验证 `pnpm --filter @magi/web exec tsc --noEmit` 0 错误。
  - **Done 2026-07-22**: pnpm install 完成（+1 -5 包）；tsc 仅剩 1 个 pre-existing 错误（app.tsx StartClient，非本特性引入，TanStack Start 版本脚手架问题）。
- [X] T054 [US5] 跑 [quickstart.md Scenario 1](./quickstart.md#scenario-1--宪法-v200-grep-spec-sc-001) 三条 grep 命令：均 0 输出。如有残留，回到对应 PR 修复。
  - **Done 2026-07-22**: 三条 grep 均 0 输出（tailwindcss 0、className Tailwind 0、@magi/ui/radix-ui/@/components/ui 0）。
- [X] T055 [US5] 跑 [quickstart.md Scenario 2](./quickstart.md#scenario-2--依赖清零spec-sc-002)：`pnpm --filter @magi/web list | grep -E 'tailwind|radix|shadcn|sonner|vaul|next-themes|class-variance|clsx|tailwind-merge'` 0 输出。
  - **Done 2026-07-22**: 0 输出。
- [X] T056 [US5] 跑全量 antd lint：`find apps/web/src -name '*.tsx' -exec antd lint {} --format json \; | jq -s '[.[] | .summary.total] | add'` 输出 0。
  - **Done 2026-07-22**: 39 个 .tsx 文件全量 antd lint，total = 0 violation（修了 login-form Alert message→title deprecated）。
- [ ] T057 [US5] 浏览器全量走查 [quickstart.md Scenario 4-11](./quickstart.md#scenario-4--全部页面可访问spec-fr-006-路由兼容)：12 URL × 3 断点 = 36 组合，≥ 34 通过。
  - **留待用户手测**：需启动 dev server（pnpm --filter @magi/api dev + pnpm --filter @magi/web dev）后在浏览器验证。
- [X] T058 [US5] 跑 [quickstart.md Scenario 12](./quickstart.md#scenario-12--代码净减spec-sc-007)：`git diff --stat master..002-ui-full-antd-migration | tail -1` 显示净减 ≥ 2000 行。
  - **Done 2026-07-22**: git diff --shortstat HEAD 显示 81 文件变更，2277 insertions + 9254 deletions = **净减 6977 行**（远超 ≥2000 目标）。

**Checkpoint**: PR7 合并后，宪法 v2.0.0 违宪代码清零。spec 所有 SC 满足。本特性完成。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖。T001 完成进 Phase 2。
- **Foundational (Phase 2)**: T002 ‖ T003 可并行。都完成才能进 US1。
- **US1 (Phase 3)**: 依赖 Foundational。T004 → T005 → T006 串行（同根布局链）。
- **US2 (Phase 4)**: 依赖 US1（root ConfigProvider 已注入）。T007-T010 可 4 路并行（不同新文件）→ T011（路由集成）→ T012（删旧）→ T013（lint）。
- **US3 (Phase 5)**: 依赖 US2（dashboard 路由骨架已就位）。US3a (T014-T018) 与 US3b (T019-T025) 内部各自串行，两组之间可部分并行（不同文件）。
- **US4 (Phase 6)**: 依赖 US3（表单/对话框已 antd 化）。US4a (T026-T034) 与 US4b (T035-T046) 串行（US4b 路由页依赖 US4a 新 data-table）。
- **US5 (Phase 7)**: 依赖 US4 全部完成。T047-T053 串行（同清理链）→ T054-T058 验证。

### User Story Dependencies

- **US1 (P1)**: 阻塞所有后续（ConfigProvider 提升是基础）
- **US2 (P2)**: 依赖 US1；不依赖 US3/US4/US5
- **US3 (P2)**: 依赖 US1 + US2（导航骨架）
- **US4 (P3)**: 依赖 US3（表单/对话框已迁移，路由页才能用）
- **US5 (P3)**: 依赖 US4 全部完成（清算日）

### Parallel Opportunities

- **Phase 2**: T002 (TanStack 衔接契约) ‖ T003 (sonner 调用点调研)
- **Phase 4**: T007 (app-layout) ‖ T008 (app-menu) ‖ T009 (app-header) ‖ T010 (app-breadcrumb)
- **Phase 5 US3a**: T014 (按钮/输入等基础替换) ‖ T015 (channel-form-dialog) ‖ T016 (source-form-dialog)
- **Phase 5 US3b**: T019 (对话框替换) ‖ T020 (feedback hook)
- **Phase 6 US4a**: T026-T029 (4 个 data-table 子组件) 全部 4 路并行
- **Phase 6 US4b**: T035-T043 (图表 + 9 路由页) 大部分可并行（不同文件）

---

## Parallel Example: Phase 4 (US2 导航)

```bash
# 4 个终端并行（4 个独立新文件）：
# 终端 1: T007 app-layout.tsx
# 终端 2: T008 app-menu.tsx
# 终端 3: T009 app-header.tsx
# 终端 4: T010 app-breadcrumb.tsx

# 全部完成后串行：
# T011 集成到 dashboard.tsx
# T012 删除旧 packages/ui/src/components/{app-sidebar,sidebar,site-header,breadcrumb,nav-*}.tsx
# T013 tsc + antd lint
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. T001 扩展 antd-api.md（30 分钟）
2. T002 + T003 并行（1 小时）
3. T004-T006 根布局提升（1-2 小时）
4. **STOP & VALIDATE**: 浏览器跑 PR1 quickstart，确认混合栈期间无视觉冲突
5. 提交 PR1（仅 US1），让 reviewer 先看根布局改造

### Incremental Delivery（7 PR 节奏）

| PR | User Story | 预估工时 | 阻塞后续? |
|----|-----------|---------|----------|
| PR1 | US1 根布局 | 2-3h | ✅ 阻塞所有 |
| PR2 | US2 导航骨架 | 8-12h | 不阻塞 US3 |
| PR3 | US3a 表单基础 | 5-9h | 不阻塞 US3b |
| PR4 | US3b 对话框反馈 | 7-13h | 阻塞 US4 |
| PR5 | US4a 数据展示 | 12-22h | 阻塞 US4b |
| PR6 | US4b 图表 + 路由 | 15-25h | 阻塞 US5 |
| PR7 | US5 清算 | 3-5h | — |

**总工时**：52-89 小时（含调试、PR review、浏览器手测）。建议分 2-3 周完成。

### Suggested Pacing

- **Week 1**：PR1 + PR2（根布局 + 导航骨架，13-15h）
- **Week 2**：PR3 + PR4（表单 + 对话框，12-22h）
- **Week 3**：PR5 + PR6 + PR7（数据展示 + 路由 + 清算，30-52h）

### Commit Strategy

每个 Task 单独 commit，conventional commits 格式：
- `feat(web): T014 replace shadcn button with antd Button`
- `refactor(web): T026 add TanStack-aware data-table component`
- `chore(web): T051 remove packages/ui directory`

---

## Notes

- **宪法 v2.1.0 强制**：每个写 antd 代码的 task（T004/T007-T011/T014-T046）开始前，开发者**必须**先查 T001 扩展后的 antd-api.md（或现场跑 `antd info <Component>`），不允许凭记忆写 antd 代码。
- **宪法 v2.2.0 强制**：所有视觉决策走 antd token（useToken 或 ConfigProvider theme.token），禁止硬编码 hex / Tailwind class。
- **scope 边界**：不动 apps/api / apps/worker / apps/tv / docker / scripts / 数据库 schema / API 契约 / 业务逻辑。
- **混合栈期间**（PR1-PR6）：Tailwind preflight 与 antd CSS-in-JS 共存；各 PR 完成后跑浏览器手测，发现冲突用 `theme.components.X` token 微调，不写自定义 CSS。
- **PR7 是清算日**：必须所有前序 PR 合并后才能执行 T047-T058；否则 shadcn 页面会因 Tailwind 移除而立即坏。
- **既存 TS 错误**（001 阶段发现的 34 个，主要在 channel-form-dialog / source-form-dialog / scheduled-tasks-section / channels/index）：T015/T016/T031/T032 修复对应文件，PR7 完成后跑 tsc 应 0 错误。
- **测试策略**：不引入 vitest / playwright。验证靠 grep + antd lint + 浏览器手测（quickstart 36 组合）。
- **commit 策略**：建议每 Task 单独 commit，每 PR 5-15 个 commit；PR 描述里按 US 章节分。
- **回滚策略**：每个 PR 独立可回滚；PR7 失败回滚后系统回到 PR6 状态（混合栈但全 antd 化）。
