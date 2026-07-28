# Data Model: 全量切换所有 UI 到 antd

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21

## Summary

本特性为**纯前端 UI 重构**，不引入新数据实体、不修改既有实体字段、不触及数据库 schema。

## Entities (Unchanged)

本特性沿用所有既有实体，不做任何字段或关系变更：

- **User**：管理员账户（含 username / password 哈希 / email / name 等）
- **Session**：登录会话
- **Channel**：频道
- **CanonicalChannel**：规范频道（合并后的统一频道）
- **ChannelOverride**：频道覆盖规则
- **ChannelStream**：频道流地址（含健康状态）
- **M3USource / XMLTVSource**：M3U / XMLTV 数据源
- **RawM3UChannel / RawXmltvChannel**：原始频道数据
- **Programme**：节目单条目
- **SyncLog**：同步日志
- **Task**（业务任务，非 React 任务）：异步任务

所有实体的字段、关系、约束、迁移文件均不变。本特性仅替换其**前端呈现层**。

## Field-Level Interactions

本特性不直接读写数据库，所有数据交互通过 apps/api 的 REST API（better-auth + 业务 endpoint）。前端组件（如频道表格、源对话框、任务详情）通过 TanStack Query 拉/推数据，本特性仅替换这些组件的视觉与交互实现，不动 query key、不变 payload 结构、不改错误处理流程。

## Validation Rules

| Rule | Source | 触发点 |
|------|--------|--------|
| 表单字段非空、格式、范围 | spec FR-012（功能等价） | 各 features/ 模块的现有 Zod schema 保持不变，仅前端校验展示走 antd Form |
| URL 格式（如添加 XMLTV 源） | 现有 Zod schema | antd Form rules + TanStack Form schema 校验 |
| 数值范围（如优先级、健康检查间隔） | 现有 Zod schema | 同上 |
| 必填项标识 | 现有 Zod schema | antd Form.Item 的 `required` 属性自动渲染 `*` |

## State Transitions

本特性不涉及实体状态机变更。仅有的"状态"是各页面的 UI 局部状态：

- 表单编辑 / 提交 / 成功 / 失败（沿用 001 LoginForm 的 useState + antd Form 模式）
- 表格分页 / 排序 / 筛选（TanStack Table 状态保留，仅 UI 换 antd Table）
- 对话框打开 / 关闭（antd Modal 的 `open` prop controlled by useState）
- 抽屉（移动端 sidebar）展开 / 收起（antd Drawer controlled by useState）

所有 UI 状态机沿用 001 模式，不引入新状态库（Zustand 5.0 既存，本特性不新增 store）。

## Migrations

**无**。本特性不动数据库 schema，不需要 drizzle migration。

## Out of Scope

- 任何实体字段新增或修改
- 任何数据库迁移
- 任何 API endpoint 变更（apps/api 完全不动）
- 任何业务逻辑变更（features/ 模块只换 UI 实现，不动 hooks / services）
- 任何认证 / 授权流程变更（better-auth 完全不动）
