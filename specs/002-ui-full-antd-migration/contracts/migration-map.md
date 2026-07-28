# Migration Map: shadcn → antd 组件映射

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Related**: [research.md Q1](../research.md#q1-packagesui-去留--整体删除-vs-保留为-antd-项目封装层)（packages/ui 删除决策）、[spec.md FR-003](../spec.md)（38 组件全部重写或删除）

本文档是 38 个 packages/ui 组件的 shadcn → antd 迁移指引。**实现时仍须按宪法 v2.1.0 跑 `antd info <Component> --format json` 查询最新 API**，本文档仅作规划期参考。

## 总览

| 类别 | 组件数 | PR 归属 | 总工作量 |
|------|--------|---------|---------|
| 导航（US2） | 7 | PR2 | 10-18h |
| 表单基础（US3a） | 9 | PR3 | 5-9h |
| 对话框与反馈（US3b） | 8 | PR4 | 7-13h |
| 数据展示（US4a） | 10 | PR5 | 12-22h |
| 图表（US4b） | 2 | PR6 | 4-8h |
| 其他（US4b） | 2 | PR6 | 3-5h |

合计：38 组件，41-75h（含调试、手测、PR review）。

## 导航（US2 / PR2）

| shadcn 组件 | antd 等价物 | 关键差异 / 注意 |
|------------|-------------|---------------|
| `app-sidebar` | `Layout.Sider` + 内部组合 | shadcn app-sidebar 是业务包装，需重组为 antd Layout.Sider + Menu |
| `sidebar` | `Layout.Sider` | shadcn sidebar 是底层抽象，antd 直接用 Layout.Sider |
| `site-header` | `Layout.Header` | 直接对应；内部元素（用户头像、面包屑）单独迁移 |
| `breadcrumb` | `Breadcrumb` | 直接对应；items 数组结构略不同 |
| `nav-main` | `Menu`（items prop） | shadcn nav-main 是 Menu items 的业务包装；直接用 antd Menu items 数组 |
| `nav-documents` | `Menu`（items prop） | 同上 |
| `nav-secondary` | `Menu`（items prop） | 同上；可能合并到主 Menu 或用单独 Menu |
| `nav-user` | `Dropdown`（overlay=Menu）+ `Avatar` | 用户头像 + 下拉菜单；antd Dropdown 接 Menu 作 overlay |

**Sider 关键 props**（实现前跑 `antd info Layout --format json`）：`breakpoint`（移动端自动折叠）、`collapsed`、`trigger`（自定义折叠按钮）。

## 表单基础（US3a / PR3）

| shadcn 组件 | antd 等价物 | 关键差异 / 注意 |
|------------|-------------|---------------|
| `button` | `Button` | 直接对应；type 属性 shadcn 用 variant，antd 用 type (primary/default/...) |
| `input` | `Input` | 直接对应；shadcn 用 variant，antd 用 variant (outlined/filled/...) |
| `textarea` | `Input.TextArea` | antd 是 Input 子组件 |
| `select` | `Select` | 直接对应；shadcn 用 Radix Select，antd 内置 |
| `checkbox` | `Checkbox` | 直接对应 |
| `label` | `Form.Item` 的 `label` 属性 | **不需要单独组件**；antd Form.Item 自动渲染 `<label for>` |
| `field` | `Form.Item` | shadcn field 是 Form.Item 等价；含 FieldGroup/FieldLabel 子组件 |
| `toggle` | `Switch` 或 `Button(type=text)` | shadcn toggle 是切换按钮；视场景用 Switch（开关）或 Button（瞬时切换） |
| `toggle-group` | `Segmented` | antd v6 Segmented 直接对应；shadcn toggle-group 是多选切换 |

## 对话框与反馈（US3b / PR4）

| shadcn 组件 | antd 等价物 | 关键差异 / 注意 |
|------------|-------------|---------------|
| `dialog` | `Modal` | 直接对应；shadcn 基于 Radix Dialog，antd 内置 |
| `alert-dialog` | `Modal.warning` 或 `useModal` hook | shadcn alert-dialog 是确认对话框；antd 用 Modal 静态方法或 hook |
| `drawer` | `Drawer` | 直接对应 |
| `sheet` | `Drawer`（`placement` 控制方向） | shadcn sheet 等价 antd Drawer；placement=right/left/top/bottom |
| `sonner` | `message`（通过 `App.useApp()` hook） | **全局 toast 替换**；antd v6 必须在 App 上下文内调用 message |
| `tooltip` | `Tooltip` | 直接对应 |
| `skeleton` | `Skeleton` | 直接对应；antd Skeleton 支持 avatar/paragraph 等组合 |
| `collapsible` | `Collapse` | 直接对应 |

**sonner → message 关键差异**：
- sonner：`toast.success("...")` 全局调用
- antd v6：`const { message } = App.useApp(); message.success("...")` —— 必须在 `<App>` 内 + hook 形式
- 所有调用点需要重构（features/* 内所有 `toast.xxx` 都要改）

## 数据展示（US4a / PR5）

| shadcn 组件 | antd 等价物 | 关键差异 / 注意 |
|------------|-------------|---------------|
| `table` | `Table` | 直接对应；shadcn 是简单封装，antd 是数据驱动（columns 配置 + dataSource） |
| `data-table` | `Table` + TanStack Table | **TanStack Table 保留**（配置层不动），渲染层换 antd Table；columnDef → antd columns 适配 |
| `data-table-column-header` | 自定义 React 组件（用 `Tooltip` + `Dropdown`） | TanStack Table 的 columnDef.header 自定义渲染 |
| `data-table-pagination` | `Pagination` 或 `Table` 自带 pagination | antd Table 自带 pagination 属性；也可单独用 Pagination |
| `data-table-view-options` | 自定义 React 组件（用 `Checkbox.Group` + `Dropdown`） | TanStack Table 的 column visibility；用 antd 组件实现 UI |
| `avatar` | `Avatar` | 直接对应；antd Avatar 支持 src/icon/fallback |
| `badge` | `Badge` | 直接对应；antd Badge 支持 status / count / dot |
| `card` | `Card` | 直接对应；antd Card 支持 title/extra/bordered |
| `tabs` | `Tabs` | 直接对应；items 数组结构 |
| `separator` | `Divider` | shadcn separator → antd Divider；支持 type=horizontal/vertical、orientation |

**TanStack Table 与 antd Table 衔接**：
- 保留 TanStack Table 的 `useReactTable` + `getCoreRowModel` 等逻辑层
- 渲染层：把 `table.getRowModel().rows` 转为 antd Table 的 `dataSource`；把 `columnDef` 转为 antd Table 的 `columns`
- 分页 / 排序 / 筛选状态用 useState 管，传给 antd Table 对应 props

## 图表（US4b / PR6）

| shadcn 组件 | 处理方式 | 关键差异 / 注意 |
|------------|---------|---------------|
| `chart` | recharts 保留，清理 Tailwind className | recharts 是数据可视化库（非 UI 框架），不在宪法禁令；颜色走 `useToken()` |
| `chart-area-interactive` | recharts 保留，清理 Tailwind className | 同上；含交互（hover/tooltip）的复杂图表 |

**合规要点**（spec SC-001）：
- 所有 `className="grid-cols-..."` / `className="text-..."` 等 Tailwind class 必须移除
- 颜色用 `useToken()` 拿 `colorPrimary` / `colorSuccess` / `colorWarning` / `colorError` 等
- 字号用 `useToken()` 拿 `fontSize` / `fontSizeSM` / `fontSizeLG`
- 容器布局用 `Row` / `Col` 或内联 style，不用 grid utility

## 其他（US4b / PR6）

| shadcn 组件 | 处理方式 | 关键差异 / 注意 |
|------------|---------|---------------|
| `section-cards` | 重组为 `Card` + `Row` + `Col` 网格 | shadcn section-cards 是 dashboard 首页的组合卡片；用 antd Grid 重组 |

## 不迁移的文件（直接删除）

以下文件不属于"组件"而是 shadcn 配置或辅助：

| 文件 | 处理 | 理由 |
|------|------|------|
| `packages/ui/src/lib/utils.ts`（含 `cn()` 函数） | 删除 | cn 是 clsx + tailwind-merge 工具，移除 shadcn 后无用 |
| `packages/ui/src/hooks/*`（如果有） | 评估保留 / 移到 apps/web/src/hooks/ | 视具体 hook 内容 |
| `packages/ui/src/styles/globals.css` | 删除 | Tailwind 入口；US5/PR7 移除 |
| `packages/ui/components.json` | 删除 | shadcn CLI 配置；US5/PR7 移除 |
| `apps/web/components.json` | 删除 | 同上 |
| `packages/ui/src/app/dashboard/data.json` | 评估移到 apps/web/src/fixtures/ | dashboard demo 数据；视是否仍被引用 |

## 路由与 features 影响清单

详见 [global-resources.md](./global-resources.md) 与 [quickstart.md](../quickstart.md)。简表：

| 路由 / 模块 | 涉及组件 | PR 归属 |
|------------|---------|---------|
| `__root.tsx` | 全局 Provider 链 | PR1 |
| `index.tsx` | 视具体内容 | PR6 |
| `login.tsx` | **不动**（001 已完成） | — |
| `dashboard/index.tsx` | section-cards + chart-area-interactive | PR6 |
| `dashboard/tasks/*` | table + data-table + drawer + dialog | PR5 + PR6 |
| `dashboard/sources/*` | table + dialog + form | PR3 + PR5 + PR6 |
| `dashboard/channels/*` | table + data-table + drawer + dialog + tabs | PR3-PR6 |
| `dashboard/epg-matching.tsx` | table + select + dialog | PR3 + PR5 + PR6 |
| `features/dashboard/channels/*` | form-dialog（channel-form-dialog.tsx 已有 TS 错误，迁移时一并修复） | PR3 + PR4 |
| `features/dashboard/epg/*` | source-form-dialog | PR3 + PR4 |
| `features/dashboard/tasks/*` | scheduled-tasks-section | PR4 + PR5 |
