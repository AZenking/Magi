# Feature Specification: 全量切换所有 UI 到 antd

**Feature Branch**: `002-ui-full-antd-migration`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "全面调整所有的UI；将其全量切换到antd"

## User Scenarios & Testing *(mandatory)*

本特性是宪法 v2.0.0 锁定的"前端 UI 走 antd v6"条款的**根治性落地** —— 完成宪法 v2.0.0 遗留迁移待办清单（packages/ui 整体重写、apps/web 所有页面切换、全局资源清理）。本特性完成后，宪法 v2.0.0 的"违宪代码"清零。

特性边界：
- **范围**：apps/web 全部路由（10 个 dashboard 页面 + features/ 模块）、packages/ui 全部组件（38 个）、__root.tsx 全局资源、apps/web/vite.config.ts、apps/web/components.json
- **不在范围**：apps/api、apps/worker、apps/tv、docker 配置、数据库 schema、业务逻辑（仅替换视觉与交互层）
- **依赖前置**：`001-redesign-login-ui` 已完成（登录页是首块试金石，提供了 ConfigProvider 局部包裹、useToken、错误分类等可复用模式）

### User Story 1 - 系统根布局统一遵循锁定设计语言 (Priority: P1)

打开 MAGI 任意页面的用户（管理员或登录中的用户）看到的所有视觉元素都来自同一套设计系统：颜色、字号、间距、圆角、动效、阴影全部由项目宪法 v2.2.0 锁定的设计语言驱动，没有任何页面"看起来像另一个产品"。本故事完成"全局视觉一致性"的基础设施建设，是所有后续故事的前提。

**Why this priority**: 根布局（全局 Provider + Tailwind preflight 移除）是所有页面的父级。如果根布局不切换，子页面的 antd 组件会被 Tailwind 全局 reset 干扰（已在 001 登录页发现）。本故事阻塞其他所有故事。

**Independent Test**: 打开任意 dashboard 页面（/dashboard、/dashboard/channels 等），用浏览器 DevTools 检查 `<html>` 与 `<body>` 元素：computed style 不再来自 Tailwind preflight（`* { margin: 0; box-sizing: border-box }` 等）；而是来自 antd ConfigProvider 注入的全局 reset。ConfigProvider 提升到根布局，所有页面共享同一主题 token。

**Acceptance Scenarios**:

1. **Given** apps/web 启动 dev server，**When** 用户访问 `/login`（已 antd 化）和 `/dashboard`（旧 shadcn 页面），**Then** 两个页面共享同一 ConfigProvider（在 `__root.tsx` 注入），同一套主题 token（colorPrimary、fontSize、borderRadius 等），视觉气质一致。
2. **Given** 开发者打开 `apps/web/vite.config.ts`，**When** 检查 plugins 列表，**Then** 不再含 `@tailwindcss/vite` 插件；vite 配置精简为 tsConfigPaths + tanstackStart + react。
3. **Given** 开发者打开 `apps/web/src/routes/__root.tsx`，**When** 检查组件树，**Then** 根布局用 `<ConfigProvider>` + `<App>`（antd）包裹 `<Outlet />`，不再用 `<ThemeProvider>`（shadcn 生态）或 `<TooltipProvider>`（radix）。
4. **Given** 开发者 grep 项目根，**When** 搜索 `globals.css`、`@import "tailwindcss"`、`@tailwindcss/vite` 关键字，**Then** 0 匹配（Tailwind 已彻底移除）。

---

### User Story 2 - 导航与页面骨架遵循锁定设计语言 (Priority: P2)

管理员在 dashboard 内的所有导航交互（侧边栏切换模块、面包屑回退、用户菜单登出）使用 antd 视觉与交互范式 —— 侧边栏选中态有 `#E6F4FF` 背景、面包屑分隔符符合 antd 规范、用户头像下拉菜单按 antd Dropdown 样式展开。

**Why this priority**: 导航骨架是所有 dashboard 页面的容器（每个 dashboard/* 路由都继承同一个 layout）。骨架不切换，子页面无论怎么改都会被外层 shadcn sidebar 视觉压制。

**Independent Test**: 登录后访问任意 dashboard 页面，用肉眼对比 antd 官网 ProLayout 示例（侧边栏、面包屑、用户菜单），视觉风格一致。源码层 grep packages/ui/src/components 下 sidebar / site-header / breadcrumb / nav-* 文件，0 出现 shadcn 关键字。

**Acceptance Scenarios**:

1. **Given** 用户已登录进入 `/dashboard`，**When** 用户点击侧边栏不同菜单项切换模块（channels / sources / tasks / epg-matching），**Then** 选中项有 antd Menu 的 `#E6F4FF` 背景与 `colorPrimary` 文字色；未选中项默认状态；切换有 antd motionDurationFast 过渡。
2. **Given** 用户进入三级路由（如 `/dashboard/channels/$channelId`），**When** 查看面包屑，**Then** 面包屑用 antd Breadcrumb 组件，分隔符为 antd 默认 `/`，当前页不可点击。
3. **Given** 用户点击右上角用户头像，**When** 下拉菜单展开，**Then** 用 antd Dropdown 渲染，菜单项（"退出登录"等）hover 时有 antd surface-container 背景，无 shadcn dropdown-menu 样式残留。
4. **Given** 移动端（375px）访问 dashboard，**When** 侧边栏自动折叠为抽屉模式，**Then** 用 antd Drawer（非 shadcn sheet）实现，抽屉宽度、动画时长符合 antd 默认 token。

---

### User Story 3 - 数据录入交互遵循锁定设计语言 (Priority: P2)

管理员在所有"录入类"页面（频道编辑、源添加、EPG 匹配规则编辑）使用的表单与弹窗全部为 antd 范式：输入框、选择器、复选框、提交按钮、确认对话框、错误提示按 antd 默认行为与视觉呈现。

**Why this priority**: 与 P2 并列。表单与弹窗是管理员日常操作的高频路径，体验不一致会显著增加认知成本。本故事与导航故事（US2）可并行（不互相依赖）。

**Independent Test**: 打开任意"新建"对话框（如新建频道、新建 XMLTV 源、新建 M3U 源），对比 antd 官网 Modal + Form 示例，视觉与交互一致。源码层 grep 对应 features 模块的 dialog/form 文件，0 出现 shadcn dialog/alert-dialog/field 关键字。

**Acceptance Scenarios**:

1. **Given** 用户在 `/dashboard/sources/xmltv` 点击"添加 XMLTV 源"，**When** 弹出对话框，**Then** 用 antd Modal 渲染（含 mask rgba(0,0,0,0.45)、boxShadowSecondary、8px 圆角）；表单字段用 antd Form + Form.Item + Input；提交按钮 loading 状态符合 antd Button 行为。
2. **Given** 用户在表单中输入无效值（如 URL 格式错误），**When** 失焦或提交，**Then** antd Form 的 rules 触发，字段下方显示红色错误文案，输入框边框变 `colorError`；不再用 shadcn Form 的错误展示样式。
3. **Given** 用户尝试删除资源（频道、源），**When** 点击删除按钮，**Then** 弹出 antd Modal.confirm 二次确认，含"取消 / 确定"两个按钮，确定按钮 type=primary + danger。
4. **Given** 用户在表单中使用 Select（如选 EPG 源、选频道组），**When** 展开下拉，**Then** 用 antd Select，选项 hover 有 antd surface-container 背景；多选用 antd 标签 chip 样式。
5. **Given** 用户在频道详情页编辑表单，**When** 切换 Tab（基本信息 / 流地址 / 健康检查），**Then** 用 antd Tabs，active tab 有 colorPrimary 文字 + 2px colorPrimary 下划线。

---

### User Story 4 - 数据浏览与可视化遵循锁定设计语言 (Priority: P3)

管理员在所有"浏览类"页面（频道列表、任务列表、EPG 匹配、源管理）使用的表格、列表、卡片、图表、徽章全部为 antd 范式。

**Why this priority**: 浏览类页面是 dashboard 主体（10 个路由中至少 7 个是表格/列表）。工作量最大，但对单个用户而言体验影响相对线性（不像导航/表单那样高频打断）。可在 US2/US3 之后做。

**Independent Test**: 打开任意数据列表页（如 `/dashboard/channels`），对比 antd 官网 Table 示例（分页、排序、筛选、行 hover），视觉一致；表格行 hover 有 antd surface-container 背景；分页器是 antd Pagination 样式。

**Acceptance Scenarios**:

1. **Given** 用户访问 `/dashboard/channels`，**When** 查看频道列表表格，**Then** 表头用 antd Table 默认样式（surface-container 背景 + title-md typography），行 hover 有 antd hover 背景；分页用 antd Pagination；每页大小切换用 antd Select。
2. **Given** 用户在表格中按列排序（如按"添加时间"倒序），**When** 点击列头，**Then** antd Table 的 sorter 行为，箭头图标与颜色符合 antd 默认。
3. **Given** 用户查看频道健康状态，**When** 看到 health_status 徽章，**Then** 用 antd Badge 或 Tag，颜色走 antd 语义色（success/warning/error），形状符合 antd rounded.md（4px 圆角）。
4. **Given** 用户查看 dashboard 首页的统计图表，**When** 加载图表，**Then** 用 antd 生态图表（@ant-design/charts 或 antd Charts）或保留 recharts 但主题走 antd token；不再用 shadcn 的 chart-area-interactive 包装层。
5. **Given** 用户查看任务列表 `/dashboard/tasks`，**When** 任务执行中显示进度，**Then** 用 antd Progress 或 Spin；任务详情页 `$taskId` 的执行日志用 antd Timeline 或 Typography.Paragraph monospace。

---

### User Story 5 - 全局视觉清理与宪法合规验证 (Priority: P3)

迁移完成后，项目代码库的"违宪代码"清零：grep 整个 monorepo，0 出现 TailwindCSS / shadcn / radix-ui 关键字；packages/ui 目录评估保留为 antd 组件再导出层（或整体删除）。

**Why this priority**: 这是"全量切换"的收尾。完成它意味着宪法 v2.0.0 的硬约束在代码层面 100% 落地，未来 grep 一次就能验证合规。与 US4 并列 P3，但必须在 US2/US3/US4 全部完成后才能做。

**Independent Test**: 跑 `grep -rE 'shadcn|radix-ui|@/components/ui/|@magi/ui/components/|tailwindcss|@tailwindcss' apps/ packages/` 在项目根，0 输出。`pnpm --filter @magi/web list` 中 0 个 shadcn 生态依赖（radix-ui / class-variance-authority / clsx / tailwind-merge / lucide-react / next-themes / sonner / vaul / tailwindcss / @tailwindcss/vite）。

**Acceptance Scenarios**:

1. **Given** 项目根，**When** 跑 `grep -rE 'className="(flex|grid|bg-|text-|p-|m-|gap-|w-|h-)' apps/web/src packages/ui/src`，**Then** 0 匹配（无 Tailwind utility class 残留）。
2. **Given** 项目根，**When** 跑 `grep -rE 'shadcn|radix-ui|@/components/ui/|@magi/ui/components/|from "sonner"|from "vaul"|from "next-themes"' apps/ packages/`，**Then** 0 匹配（无 shadcn 生态 import 残留）。
3. **Given** apps/web/package.json，**When** 检查 dependencies 与 devDependencies，**Then** 不含 tailwindcss、@tailwindcss/vite、radix-ui、class-variance-authority、clsx、tailwind-merge、lucide-react、next-themes、sonner、vaul；含 antd、@ant-design/icons、@ant-design/charts（如采用）。
4. **Given** packages/ui 目录，**When** 评估是否保留，**Then** 二选一：(a) 整体删除（apps/web 直接从 antd 导入）或 (b) 保留为 antd 组件的项目级封装层（含主题预设、复用组合）。决策写入 plan.md。
5. **Given** apps/web 与 packages/ui 源码，**When** 跑 antd lint（CLI）全量扫描，**Then** 0 deprecated / 0 a11y / 0 usage / 0 performance violation。

---

### Edge Cases

- 用户在迁移过程中访问"半成品"页面（部分组件已切换、部分仍是 shadcn）：本特性采用**分批 PR 策略**（按 user story 切分），每个 PR 内部完整切换一组组件；PR 之间允许短期混合栈，但单个 PR 合并后该组组件 100% 切换。混合栈期间 Tailwind preflight 与 antd CSS-in-JS 共存（001 已验证可行）。
- 第三方依赖（如 recharts）的样式与 antd 冲突：在 plan.md 决定是否替换为 @ant-design/charts，或保留 recharts 但用 antd token 包装。
- 用户保存的浏览器书签指向旧路径（如 /dashboard/sources/xmltv）：路由路径**不变**（仅视觉层切换），所有 URL 保持兼容。
- 移动端 sidebar 折叠行为变化：迁移到 antd Drawer 后，触发方式与动画时长与旧 shadcn sheet 不同，需要在 quickstart 中验证管理员能找到并使用。
- 国际化：登录页用简体中文（001 已定），其他页面**继续用简体中文**，不引入 i18n 框架（YAGNI，单人维护项目）。
- 暗黑模式：现状有 next-themes 但实际未启用。本特性完成后，暗黑模式作为独立特性（按 ConfigProvider algorithm: [darkAlgorithm] 切换），不在本特性范围内。
- 测试覆盖：001 已决策不引入测试框架。本特性沿用，验证靠 grep + antd lint + 浏览器手测 + 各页面快速走查清单（在 plan.md 的 quickstart 中按页面列）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 项目根布局（`apps/web/src/routes/__root.tsx`）MUST 用 antd `<ConfigProvider>` + `<App>` 包裹 `<Outlet />`，注入宪法 v2.2.0 锁定的 5 个核心 token（colorPrimary / fontSize / borderRadius / colorBgLayout / colorBgContainer）与 zhCN locale。
- **FR-002**: apps/web MUST 移除 `@tailwindcss/vite` 插件（vite.config.ts）、移除 `@magi/ui/globals.css` 引入（__root.tsx）、移除 tailwindcss / shadcn 生态依赖（package.json）。
- **FR-003**: packages/ui 的 38 个 shadcn 组件 MUST 全部重写为 antd 等价物（如 sidebar → Layout.Sider、dialog → Modal、dropdown-menu → Dropdown、alert-dialog → Modal.warning/useModal）或直接删除（由 apps/web 直接从 antd 导入）。
- **FR-004**: apps/web 的 10 个 dashboard 路由（含 features/ 模块）MUST 将所有 `@magi/ui/components/*` 与 `@/components/ui/*` import 替换为 antd 直接 import 或新 packages/ui（如保留）。
- **FR-005**: 全局反馈机制 MUST 统一到 antd：toast（sonner）→ antd `message`；confirm 对话框 → antd `Modal.confirm` 或 `useModal`；通知 → antd `notification`。所有调用 MUST 在 `<App>` 上下文内（hook 形式）或用 antd v6 的 `App.useApp()` 拿上下文化实例。
- **FR-006**: 所有路由路径 MUST 保持不变（仅视觉层切换），URL 兼容性 100%。
- **FR-007**: 所有页面 MUST 在桌面（≥ 1280px）、平板（≥ 768px）、移动（≥ 360px）三个断点下完整可用，无横向滚动条；侧边栏在移动端自动折叠为 Drawer。
- **FR-008**: 所有视觉决策（颜色 / 字号 / 间距 / 圆角 / 动效 / 阴影）MUST 走 antd token（useToken hook 或 theme.token 配置），MUST NOT 硬编码 hex 或 magic number（宪法 v2.2.0）。
- **FR-009**: 所有 antd 代码 MUST 遵循宪法 v2.1.0 流程（写前 antd info 查询、写后 antd lint 校验），各组件的实现 PR 描述 MUST 引用对应 antd info 命令的输出参考。
- **FR-010**: 图表组件（chart-area-interactive）MUST 评估替换为 antd 生态（@ant-design/charts）或保留 recharts 但样式走 antd token；决策写入 plan.md。
- **FR-011**: 所有数据表格（data-table 系列）MUST 用 antd Table 重写，保留现有的排序、筛选、分页、列可见性功能（不丢失任何用户能力）。
- **FR-012**: 切换后所有页面的核心功能（增删改查、表单提交、错误反馈）MUST 与切换前等价 —— 用户操作流程不变，只是视觉与交互范式切换。
- **FR-013**: 项目代码库 MUST 通过宪法合规 grep（spec acceptance 5.1 / 5.2），0 出现旧栈关键字。

### Key Entities *(include if feature involves data)*

本特性为**纯前端 UI 重构**，不引入新数据实体、不修改既有实体字段、不触及数据库 schema。沿用既有实体（User / Session / Channel / Source / Programme / Task / SyncLog 等），仅替换其呈现层。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 项目代码库的 TailwindCSS / shadcn / radix-ui 关键字 grep 命中数 = **0**（spec acceptance 5.1 / 5.2 双命令均无输出）。
- **SC-002**: apps/web/package.json 的 dependencies + devDependencies 中 shadcn 生态包数 = **0**（radix-ui / class-variance-authority / clsx / tailwind-merge / lucide-react / next-themes / sonner / vaul / tailwindcss / @tailwindcss/vite 共 10 个全部移除）。
- **SC-003**: apps/web 全部 10 个 dashboard 路由 + login 页 + index 页**均能在桌面/平板/移动三断点下完整使用**（quickstart 按 12 个页面 × 3 断点 = 36 个组合手测，≥ 34 个通过即合规，允许 2 个非关键缺陷）。
- **SC-004**: 全量 antd lint（CLI 扫描 apps/web + packages/ui 所有 .tsx 文件）0 critical / 0 serious violation，含 a11y / deprecated / usage / performance 四类。
- **SC-005**: 切换前后用户操作流程**功能等价**：每个核心流程（登录、添加 XMLTV 源、添加 M3U 源、匹配 EPG、查看频道详情、查看任务详情）切换后均能完成，且步骤数 ≤ 切换前步骤数。
- **SC-006**: 视觉一致性盲测：5 名内部观察者对比 3 个核心页面（/login、/dashboard、/dashboard/channels）与 antd 官网对应示例，≥ 4 人认为"明显属于同一设计语言"。
- **SC-007**: 总代码行数 **减少**（移除 shadcn 组件源码 + Tailwind config + globals.css，净减 ≥ 2000 行；新增 antd 包装层若保留 packages/ui 不得超过净增 500 行）。

## Assumptions

- **前置依赖**：001-redesign-login-ui 已完成并合并（提供 ConfigProvider 局部包裹、useToken、错误分类、Alert 自动消失等可复用模式与 contracts/antd-api.md 速查）。
- **分批 PR 策略**：本特性按 user story 切分多个 PR，每个 PR 完整切换一组组件；PR 之间允许短期混合栈但每个 PR 内部 100% 切换该组。
- **packages/ui 去留**：在 plan 阶段决定 (a) 整体删除（apps/web 直接从 antd 导入）或 (b) 保留为 antd 组件的项目级封装层（主题预设、组合封装）。spec 不预设，但建议方案 (a)（最简单，YAGNI）。
- **图表组件策略**：在 plan 阶段决定 (a) 用 @ant-design/charts 替换 recharts 或 (b) 保留 recharts 但样式走 antd token。建议 (a) 长期最干净。
- **图标库**：lucide-react（shadcn 默认）→ @ant-design/icons（antd 默认）。一对一替换 antd 没有的图标时，可保留 lucide-react 作为补充（不视为违宪，因为 lucide-react 不是 UI 框架，是图标资源）。
- **国际化**：所有页面继续用简体中文，不引入 i18n 框架。
- **暗黑模式**：不在本特性范围（next-themes 移除后，未来作为独立特性用 ConfigProvider algorithm 实现）。
- **测试框架**：不引入（YAGNI）。验证靠 grep + antd lint + 浏览器手测。
- **浏览器范围**：现代 Chrome / Edge / Safari / Firefox 最新两个稳定版本。
- **路由路径**：100% 保持不变，URL 兼容。
- **数据契约**：apps/api 的所有 API endpoint 完全不变，本特性仅替换前端视觉与交互层。
- **执行节奏**：建议每个 user story 一个 PR，6 个 PR 总计；每个 PR 独立 review、独立部署、独立回滚。允许跨 PR 的混合栈期间 Tailwind 与 antd 共存（001 已验证可行）。
