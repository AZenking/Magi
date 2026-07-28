# Implementation Plan: UI Polish

## Summary

以 Ant Design v6 为唯一 UI 体系，修复全局视觉基线、页面区块间距、Select 可用性、加载/错误反馈、详情页响应式和可访问性；移除过渡期兼容层与 Lucide。

## Technical Context

- React 19 + TanStack Start/Router/Query/Table
- antd v6 + `@ant-design/icons`
- TypeScript strict mode
- Vitest + Testing Library
- 范围仅限 `apps/web` 与本 feature 文档；不改变 API、数据模型或业务契约

## Constitution Check

- [x] 前端仅使用 antd v6；未引入 Tailwind、shadcn、Radix 或其他 UI 框架
- [x] 实现前已查询 `antd design.md` 及所用组件的 v6 API/demo
- [x] 自定义视觉值使用 theme token；排版仅使用 400/600
- [x] 4px spacing scale 与响应式断点符合宪法
- [x] `eslint`、`tsc --noEmit`、`antd lint`、生产构建和测试均纳入验证
- [x] 无 API、Worker、数据库或共享契约变更

## Implementation Strategy

1. 添加最小全局 reset，并在根路由中加载。
2. 建立复用的 `PageStack`、`PageHeader`、`FilterBar`，统一列表页与详情页间距。
3. 将兼容组件与 Lucide 全部替换为 antd 组件和图标。
4. 使用 token、Typography、Tag、Progress、Result、Spin、Empty 等语义组件替代硬编码样式。
5. 为数据请求补充加载、错误、重试及异步任务跳转反馈。
6. 修复 375px 下的侧栏、抽屉、表格和详情列表布局。
7. 添加页面标题及任务状态的行为测试，并运行全部质量门槛。

## Complexity Tracking

无宪法例外。新增测试依赖仅用于 `apps/web` 的组件行为验证。
