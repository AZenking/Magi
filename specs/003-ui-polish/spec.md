# Feature Specification: UI Polish — 全局重置与页面间距修复

**Feature Branch**: `003-ui-polish`

**Created**: 2026-07-22

**Status**: Completed

**Input**: User description: "查看剩余UI；继续调整"

## 背景

002-ui-full-antd-migration 完成了全量 antd 迁移（移除 Tailwind preflight + 删除 packages/ui + 清零 shadcn 依赖）。但 PR7 移除 Tailwind preflight 时**未补充 antd 侧的全局 reset**，导致以下回归缺陷：

1. **body 有 8px 默认 margin**（浏览器 user-agent 默认，Tailwind preflight 原本清零了它）
2. **body 字号是 16px**（antd design.md 要求 14px；ConfigProvider 的 fontSize token 只作用于 `.ant-*` 组件，不影响原生 `<h1>`/`<p>`/`<span>`）
3. **原生标题用 font-weight 700**（design.md headline 规范是 600）
4. **所有列表页（源/频道/任务/节目）的页面区块之间 0 间距** — 页面组件返回裸 `<>fragment</>`，header/filter/table/pagination 全部紧贴甚至重叠
5. **遗留 Select 兼容层的 options 未正确注册** — 下拉打开时 options 数为 0，用户无法选择；本次以原生 antd Select 统一替换

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 全局视觉基线对齐 (Priority: P1)

管理员打开任意页面时，页面不再有浏览器默认的 8px body 边距、16px 基础字号、或 700 字重的标题。所有原生 HTML 元素（h1/h2/p/span/code/pre）的排版与 antd 官方 design.md 一致（14px 基础、400/600 两档字重、PingFang SC 字体栈）。

**Why this priority**: 这是所有页面的视觉基础。body 8px margin 导致整个 layout 偏移；16px 字号让原生文字比 antd 组件文字大一圈，视觉不协调。不修这个，后续页面级修复都建立在错误基线上。

**Independent Test**: 打开任意页面 → DevTools 检查 body computed style：`margin: 0`、`font-size: 14px`。检查 h1：`font-weight: 600`。肉眼对比页面原生文字与 antd 组件文字大小一致。

**Acceptance Scenarios**:

1. **Given** 管理员已登录，**When** 打开 `/dashboard`，**Then** body 的 computed margin 为 0、fontSize 为 14px
2. **Given** 任意页面，**When** DevTools 检查 `<h1>` 元素，**Then** font-weight 为 600（不是 700）、lineHeight 符合 design.md headline-md 的 32px
3. **Given** 任意页面，**When** 对比原生 `<span>` 文字与 `.ant-typography` 文字，**Then** 两者 fontSize 一致（14px），无"原生文字偏大"的视觉断层
4. **Given** 页面包含 `<pre>`/`<code>`，**When** 检查其字体，**Then** 使用 design.md code 字体栈（SFMono-Regular / Consolas / monospace）、字号 13px

---

### User Story 2 - 列表页区块间距修复 (Priority: P1)

管理员打开源管理、频道管理、任务管理、节目单预览等列表页时，页面顶部标题栏、筛选行、表格、分页栏之间有合理的垂直间距（16-24px），不再紧贴或重叠。

**Why this priority**: 当前所有列表页的 header/filter/table/pagination 之间 0 间距（实测 gap=0px 甚至 -35px 重叠），页面完全不可用。这是功能性阻塞，不是锦上添花。

**Independent Test**: 打开 `/dashboard/sources/m3u` → 肉眼确认"标题栏 → 搜索行 → 表格 → 分页"之间各有清晰间距；DevTools 测量相邻区块 gap ≥ 16px。

**Acceptance Scenarios**:

1. **Given** 管理员打开 `/dashboard/sources/m3u`，**When** 页面渲染完成，**Then** "M3U 源"标题栏与下方搜索/筛选行之间有 ≥ 16px 垂直间距
2. **Given** 同一页面，**When** 检查筛选行与表格之间，**Then** 有 ≥ 16px 间距
3. **Given** 同一页面，**When** 检查表格与分页栏之间，**Then** 有 ≥ 16px 间距
4. **Given** 上述间距规则，**When** 对所有 6 个列表页（M3U 源、XMLTV 源、原始频道、节目单、输出频道、任务）逐一验证，**Then** 每个页面的区块间距均 ≥ 16px，无重叠
5. **Given** 详情页（任务详情/频道详情），**When** 检查 section 之间，**Then** 有 ≥ 16px 间距

---

### User Story 3 - Select 下拉选项可见 (Priority: P1)

管理员在频道管理页的筛选下拉框（EPG 状态/播放源状态/分组）、任务管理页的状态/队列筛选、源管理的 M3U/XMLTV 源筛选中，点击下拉框后能看到完整的选项列表并选择。

**Why this priority**: 当前 Select 兼容层（shadcn-compat 的 Select/SelectTrigger/SelectContent/SelectItem）options 注册机制有 bug，下拉打开后 options 数为 0，用户无法筛选。这是功能性阻塞。

**Independent Test**: 打开 `/dashboard/channels` → 点击"EPG 状态"下拉 → 确认看到"全部/自动匹配/手动匹配/未匹配/冲突"5 个选项 → 选择"未匹配" → 确认筛选生效。

**Acceptance Scenarios**:

1. **Given** 管理员打开 `/dashboard/channels`，**When** 点击"EPG 状态"下拉框，**Then** 下拉面板显示 5 个选项（全部/自动匹配/手动匹配/未匹配/冲突）
2. **Given** 下拉已打开，**When** 选择"未匹配"，**Then** 下拉关闭、选中值显示为"未匹配"、表格刷新为仅未匹配频道
3. **Given** 任务管理页 `/dashboard/tasks`，**When** 点击"状态筛选"下拉，**Then** 显示 6 个选项（全部状态/等待中/运行中/成功/失败/已取消）
4. **Given** 定时任务区域，**When** 点击执行间隔的 Select，**Then** 显示 7 个间隔选项（每5分钟~每24小时）
5. **Given** EPG 匹配页，**When** 点击"XMLTV 源"下拉，**Then** 显示所有已添加的 XMLTV 源名称

---

### User Story 4 - 登录页居中与视觉完善 (Priority: P2)

管理员访问登录页时，登录卡片在视口中水平+垂直居中，背景为 design.md 的 surface-layout 色（#F5F5F5），有适当的留白和视觉层次。

**Why this priority**: 登录页是用户入口，当前可能因 body margin 8px 导致整体偏移、未居中。P2 因为只有 1 个页面受影响，不阻塞核心业务。

**Independent Test**: 打开 `/login`（未登录状态）→ 肉眼确认登录卡片在屏幕正中央、背景为浅灰、无 8px 偏移。

**Acceptance Scenarios**:

1. **Given** 未登录用户访问 `/login`，**When** 页面加载完成，**Then** 登录卡片在视口水平+垂直居中
2. **Given** 登录页，**When** 检查 body 背景，**Then** 为 design.md surface-layout 色（#F5F5F5），不是透明/白色
3. **Given** 登录页，**When** 检查 body margin，**Then** 为 0（无 8px 偏移）

---

### Edge Cases

- **antd 组件不受全局 reset 影响**：全局 reset（body margin: 0、font-size: 14px）不能破坏 antd 组件的自身样式（`.ant-*` class 有自己的样式覆盖）。验证：reset 后 antd Button/Input/Table 视觉不变。
- **SSR 兼容**：全局样式注入方式（CSS 文件 vs `@ant-design/cssinjs` vs ConfigProvider）必须在 SSR（TanStack Start）下正常工作，不出现样式闪烁（FOUC）。
- **Select options 异步加载**：EPG 匹配页的 XMLTV 源列表、频道分组列表是异步从 API 加载的。Select options 注册机制必须能在 options 数据到达后正确更新下拉内容。
- **移动端 375px**：全局 reset 和间距不能导致移动端横向滚动。间距在 375px 断点下允许缩小到 8-12px。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 注入全局 CSS reset，使 body 的 margin 为 0、padding 为 0
- **FR-002**: 系统 MUST 设定 body 的基础字号为 14px（design.md body-md 标准）
- **FR-003**: 系统 MUST 设定全局字体栈为 design.md 规定的 `"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"`
- **FR-004**: 系统 MUST 设定标题元素（h1-h6）的字重为 600（design.md headline/title 规范），而非浏览器默认的 700
- **FR-005**: 系统 MUST 设定 `* { box-sizing: border-box }` 全局盒模型，确保布局计算一致
- **FR-006**: 系统 MUST 在所有列表页（源/频道/任务/节目）的页面根容器提供 ≥ 16px 的子元素垂直间距
- **FR-007**: 系统 MUST 使用 antd 原生 Select 的 `options` 数据源，确保下拉面板在用户点击时正确显示所有选项
- **FR-008**: 系统 MUST 确保 Select 的选中值变化能正确触发 `onChange` 回调，驱动数据筛选
- **FR-009**: 登录页 MUST 在视口中水平+垂直居中，背景为 surface-layout 色
- **FR-010**: 全局 reset MUST NOT 破坏 antd 组件自身样式（`.ant-*` class scope 不受影响）
- **FR-011**: 全局 reset MUST 在 SSR 环境下正常工作，无样式闪烁

### Key Entities

本特性不涉及数据实体变更。仅涉及前端视觉呈现层。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 所有 12 个页面的 body computed margin 为 0、font-size 为 14px（DevTools 检查 12 URL 均 0 命中异常）
- **SC-002**: 所有列表页（6 个）的相邻页面区块（header→filter→table→pagination）垂直间距均 ≥ 16px
- **SC-003**: 所有 Select 下拉框（频道筛选 4 个 + 任务筛选 2 个 + 定时间隔 1 个 + EPG 源 1 个 + 节目筛选 1 个 = ≥ 9 个）点击后均正确显示选项列表，options 数 ≥ 预期
- **SC-004**: 全局 reset 后，5 名内部观察者盲测中 ≥ 4 人认为页面排版"与 antd 官方示例属于同一设计语言"
- **SC-005**: 所有 12 个页面在 1440px 桌面 + 375px 移动两个断点下无横向滚动条、无内容重叠
- **SC-006**: antd lint 全量扫描 0 violation（修复过程中不引入新的 deprecated/usage 问题）

## Assumptions

- **前置依赖**：002-ui-full-antd-migration 已完成（全量 antd 迁移 + Tailwind 移除 + packages/ui 删除）。本特性是其收尾修复。
- **全局 reset 方案**：采用轻量 CSS reset（注入到 __root.tsx 的 head 或独立 globals 文件），不重新引入 Tailwind / normalize.css / preflight。reset 内容仅覆盖 body margin/font/box-sizing + 标题字重，最小化。
- **间距方案**：在每个列表页的 `<>fragment</>` 外层包一个 `<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>`，而非逐个元素加 margin。这符合 antd 的 flat-first 风格。
- **Select 修复方案**：删除 shadcn 兼容层，统一改为 antd 原生 Select，并直接提供 `options`。
- **暗黑模式**：不在本特性范围（沿用 002 决策，留独立特性）。
- **国际化**：继续简体中文，不引入 i18n。
- **scope 边界**：不动 apps/api / apps/worker / apps/tv / docker / 数据库 / API 契约 / 业务逻辑。
