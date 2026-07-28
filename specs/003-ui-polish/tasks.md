# Tasks: UI Polish

## Phase 1 — Visual baseline

- [x] T001 添加全局 box-sizing、body reset、14px 字号、400/600 字重和代码字体
- [x] T002 用 antd token 统一应用壳层背景、边框、间距与响应式侧栏
- [x] T003 建立共享 PageStack、PageHeader、FilterBar

## Phase 2 — Native antd migration

- [x] T004 将所有 Select 改为原生 antd `options` / `onChange`
- [x] T005 删除 `shadcn-compat` 及全部调用
- [x] T006 用 `@ant-design/icons` 替换 Lucide 并移除依赖
- [x] T007 清除 UI 源码中的硬编码 hex、500/700 字重

## Phase 3 — UX completion

- [x] T008 为列表、工作台、认证检查和详情页补充 loading/error/retry/empty 状态
- [x] T009 为源同步、源检查与 EPG 匹配通知补充任务详情入口
- [x] T010 修复移动端侧栏、内容 padding、表格横向滚动和任务抽屉宽度
- [x] T011 用 Button/List 等可访问交互替换可点击 span/裸按钮

## Phase 4 — Verification

- [x] T012 添加 PageHeader 与 TaskDetailContent 行为测试
- [x] T013 `pnpm --filter @magi/web exec tsc --noEmit`
- [x] T014 `pnpm --filter @magi/web lint`
- [x] T015 `antd lint apps/web/src --format json`（0 issues）
- [x] T016 `pnpm --filter @magi/web test`（2 files / 3 tests）
- [x] T017 `pnpm --filter @magi/web build`
