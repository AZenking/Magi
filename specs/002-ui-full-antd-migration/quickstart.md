# Quickstart: 全量切换所有 UI 到 antd 验证

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Related**: [spec.md](./spec.md) SC-001/002/003/004/005/006、[contracts/migration-map.md](./contracts/migration-map.md)、[contracts/global-resources.md](./contracts/global-resources.md)

本文档描述**端到端验证场景**，证明本特性 7 个 PR 完成后 spec 要求 100% 满足。**不含**完整代码实现（见 tasks.md）。

## Prerequisites

- Docker Desktop / OrbStack 已启动
- pnpm ≥ 10、Node ≥ 20
- 端口 15432 / 16379 / 3000 / 3001 空闲
- 已 `pnpm install` 过
- **前置依赖**：001-redesign-login-ui 已合并（提供 antd 6.5.1 装好的 apps/web）

## Setup

```bash
# 1. 启动 postgres + redis（如未启动）
bash scripts/init-dev.sh

# 2. 启动 web + api dev server
pnpm --filter @magi/api dev    # 终端 1
pnpm --filter @magi/web dev    # 终端 2

# 期望：vite + nest 同时启动，无 TS 报错（既存 34 个错误应已被本特性修复或仍存在但与本特性无关）
```

## 测试维度

本特性规模大，验证按"**层级验证 → 全量验证**"两阶段：

### 阶段 A：PR 级验证（每个 PR 合并前跑）

每个 PR（PR1-PR7）合并前跑对应 user story 的 acceptance scenarios，详见 spec.md 对应章节。

### 阶段 B：全量验证（PR7 合并后跑，证明 spec SC 全满足）

跑完下方 Scenario 1-12。

## Test Scenarios（阶段 B 全量验证）

### Scenario 1 — 宪法 v2.0.0 grep（spec SC-001）

**Steps**:

```bash
# 在项目根
grep -rE 'tailwindcss|@tailwindcss|@import "tailwindcss"' apps/ packages/ \
  --include='*.ts' --include='*.tsx' --include='*.css' --include='*.json' \
  --include='*.js' --include='*.mjs'

grep -rE 'className="(flex|grid|bg-|text-|p-|m-|gap-|w-|h-)' \
  apps/web/src packages/ui/src

grep -rE 'shadcn|radix-ui|@/components/ui/|@magi/ui/components/' \
  apps/ packages/
```

**Expected**: 三条命令**均无输出**（0 命中）。

### Scenario 2 — 依赖清零（spec SC-002）

**Steps**:

```bash
pnpm --filter @magi/web list 2>&1 | \
  grep -E 'tailwind|radix|shadcn|sonner|vaul|next-themes|class-variance|clsx|tailwind-merge|lucide-react'
```

**Expected**: **0 输出**（10 个 shadcn 生态包全部移除；lucide-react 视情况保留作 antd icons 补充）。

### Scenario 3 — 全量 antd lint（spec SC-004）

**Steps**:

```bash
# 全量扫描 apps/web/src
find apps/web/src -name '*.tsx' -exec antd lint {} --format json \; | \
  jq -s '[.[] | .summary.total] | add'
```

**Expected**: 输出 `0`（所有 .tsx 文件 0 violation，含 a11y / deprecated / usage / performance）。

### Scenario 4 — 全部页面可访问（spec FR-006 路由兼容）

**Steps**:

1. 浏览器登录 `http://localhost:3000/login`（admin / zxcv1234）
2. 依次访问以下 12 个 URL，验证均无白屏、无控制台错误：

| URL | 期望 |
|-----|------|
| `/` | 重定向到 `/dashboard` 或显示首页 |
| `/login` | 已登录则重定向 `/dashboard` |
| `/dashboard` | 显示 dashboard 首页（section-cards + chart） |
| `/dashboard/tasks` | 任务列表 |
| `/dashboard/tasks/<某个 taskId>` | 任务详情 |
| `/dashboard/sources/channels` | 源-频道管理 |
| `/dashboard/sources/programmes` | 源-节目 |
| `/dashboard/sources/xmltv` | XMLTV 源管理 |
| `/dashboard/sources/m3u` | M3U 源管理 |
| `/dashboard/channels` | 频道列表 |
| `/dashboard/channels/<某个 channelId>` | 频道详情 |
| `/dashboard/epg-matching` | EPG 匹配 |

**Expected**: 12 个 URL 全部 200，无 404 / 500 / 白屏。浏览器 DevTools Console 0 error。

### Scenario 5 — 视觉一致性（spec SC-006）

**Steps**:

1. 浏览器同时打开 3 个标签：
   - `http://localhost:3000/login`
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/dashboard/channels`
2. 同时打开 antd 官网 v6 示例（`https://ant.design/components/form-cn` / `prolayout` / `table-cn`）
3. 肉眼对比

**Expected**: 5 名内部观察者盲测中 ≥ 4 人认为 3 个本地页面与 antd 官方示例"明显属于同一设计语言"。具体观察点：
- 圆角（按钮 6px、卡片 8px）
- 主色（`#1677FF`）
- 字号（14px 基础）
- 间距（4px 网格：4 / 8 / 16 / 24 / 32）
- 圆角 / 阴影 / 动效与 antd 官方一致

### Scenario 6 — 响应式 36 组合（spec SC-003）

**Steps**:

DevTools → Toggle Device Toolbar，对每个页面跑 3 个断点：

| 断点 | 尺寸 | 设备示例 |
|------|------|---------|
| Desktop | 1920×1080 或 1440×900 | 桌面 |
| Tablet | 768×1024 | iPad Mini |
| Mobile | 375×667 | iPhone SE |

12 页面 × 3 断点 = 36 组合。

**Expected**: ≥ 34 组合通过（允许 2 个非关键缺陷，如某页面在 375px 下表格横向滚动）。"通过"标准：
- 无横向滚动条（除表格本体）
- 表单完整可见
- sidebar 在 375px 自动折叠为 Drawer
- 按钮可点击、文字不截断

### Scenario 7 — 功能等价（spec SC-005）

**Steps**:

每个核心流程切换前后步骤数对比（建议 PR1 前先记录"切换前步骤数"作基线）：

| 流程 | 切换前步骤 | 切换后期望 |
|------|----------|-----------|
| 登录 | 3（输用户名→输密码→点登录） | ≤ 3 |
| 添加 XMLTV 源 | ?（实测） | ≤ 切换前 |
| 添加 M3U 源 | ?（实测） | ≤ 切换前 |
| 编辑频道 | ?（实测） | ≤ 切换前 |
| 删除频道（含确认） | ?（实测） | ≤ 切换前 |
| 查看 EPG 匹配 | ?（实测） | ≤ 切换前 |
| 查看任务详情 | ?（实测） | ≤ 切换前 |

**Expected**: 切换后所有流程步骤数 ≤ 切换前。

### Scenario 8 — antd Form 与 TanStack Form 衔接

**Steps**:

1. 打开 `/dashboard/sources/xmltv` → 点"添加 XMLTV 源"
2. 弹出 antd Modal + antd Form + antd Input
3. 输入无效 URL（如 "not-a-url"）→ 失焦
4. **Expected**: antd Form rules 触发，字段下方红色错误"URL 格式错误"
5. 输入有效 URL → 提交
6. **Expected**: Modal loading → 成功后关闭 + antd message.success("添加成功") + 表格刷新

### Scenario 9 — sonner → antd message 替换

**Steps**:

1. 任意触发成功/错误反馈（如 Scenario 8 的提交）
2. **Expected**: 反馈用 antd message（顶部居中滑入），**不再用** sonner toast（右下角弹出）

### Scenario 10 — 表格交互（TanStack Table + antd Table）

**Steps**:

1. 打开 `/dashboard/channels`（频道列表）
2. 测试以下交互：
   - 点列头排序 → antd Table sorter 行为，箭头图标
   - 切换每页大小 → antd Select 弹出，选 10/20/50
   - 翻页 → antd Pagination
   - 列可见性（data-table-view-options 等价）→ antd Dropdown + Checkbox.Group
   - 行 hover → antd surface-container 背景

**Expected**: 全部交互符合 antd 默认行为。

### Scenario 11 — 移动端 sidebar 折叠

**Steps**:

1. DevTools 切到 375×667
2. 访问 `/dashboard`
3. **Expected**: sidebar 自动折叠为 Drawer，左上角有"汉堡"按钮
4. 点汉堡按钮 → antd Drawer 从左侧滑入（motionDurationSlow 0.3s）
5. 点 Drawer 内菜单项 → Drawer 关闭 + 路由切换

### Scenario 12 — 代码净减（spec SC-007）

**Steps**:

```bash
# PR7 合并后
git log --oneline master..002-ui-full-antd-migration | wc -l  # 总 commit 数
git diff --stat master..002-ui-full-antd-migration | tail -1   # 总行数变化
```

**Expected**: 净减 ≥ 2000 行（移除 shadcn 组件源码 ~3000 行 + Tailwind config + globals.css，新增 antd 包装层若保留 packages/ui 不得超过净增 500 行 —— 但 Q1 决定 packages/ui 整体删除，应是大额净减）。

## PR 级验证清单（阶段 A）

每个 PR 合并前，跑对应 User Story 的 acceptance scenarios：

### PR1 (US1 根布局)
- [ ] __root.tsx 含 ConfigProvider + App，包 Outlet
- [ ] 任意 dashboard 页面打开 DevTools，html/body computed style 不再来自 Tailwind preflight
- [ ] login.tsx 局部 ConfigProvider 已移除（root 已注入）
- [ ] 不动 globals.css（仍存在，混合栈期间保留）

### PR2 (US2 导航)
- [ ] sidebar 选中项 `#E6F4FF` 背景 + colorPrimary 文字
- [ ] 面包屑用 antd Breadcrumb，分隔符 `/`
- [ ] 用户头像下拉用 antd Dropdown + Menu
- [ ] 移动端 sidebar 折叠用 antd Drawer（非 shadcn sheet）

### PR3 (US3a 表单基础)
- [ ] 所有 button/input/select/checkbox 视觉与 antd 官方示例一致
- [ ] Form.Item label 自动渲染 `<label for>`
- [ ] 表单字段错误状态用 antd Form rules（非 TanStack Form 单独校验）
- [ ] TanStack Form 与 antd Form 衔接无 type 错误

### PR4 (US3b 对话框反馈)
- [ ] 所有 dialog → antd Modal（mask rgba(0,0,0,0.45)、boxShadowSecondary、8px 圆角）
- [ ] alert-dialog → Modal.warning 或 useModal
- [ ] sonner 调用全部改为 `App.useApp().message`
- [ ] tooltip / skeleton / collapsible 视觉符合 antd 默认

### PR5 (US4a 数据展示)
- [ ] table → antd Table（surface-container 表头、hover 行）
- [ ] TanStack Table 状态（分页/排序/筛选）正确驱动 antd Table
- [ ] data-table-column-header / view-options 自定义组件用 antd 子组件
- [ ] avatar/badge/card/tabs/divider 视觉符合 antd 默认

### PR6 (US4b 图表 + 路由页)
- [ ] recharts 文件 0 Tailwind className
- [ ] recharts 颜色用 useToken()
- [ ] 10 个 dashboard 路由页全部用 antd 组件，0 shadcn import
- [ ] features/* 模块全部用 antd 组件

### PR7 (US5 清算)
- [ ] Scenario 1（grep）3 条命令均 0 输出
- [ ] Scenario 2（依赖）0 输出
- [ ] Scenario 3（antd lint）total = 0
- [ ] packages/ui 目录已删除
- [ ] globals.css / components.json / vite.config.ts 的 tailwindcss 引用全部移除
- [ ] apps/web 跑 `pnpm exec tsc --noEmit` 0 错误（既存 34 个错误应已修复或明确归因）

## Out of Scope Verification

以下**不在本特性验证范围**：

- 暗黑模式（next-themes 移除后，未来独立特性用 ConfigProvider algorithm 实现）
- 国际化（继续简体中文）
- 测试自动化（仍靠手测，不引入 vitest/playwright）
- apps/tv（尚未启动）
- 性能 benchmark（FCP 等指标不强制测，dev 环境无感即可）

## Tear Down

```bash
# 关闭 dev server（Ctrl+C 各终端）
# 容器保留
# 如需彻底清掉：
# bash scripts/docker-down.sh  # 不删数据卷
# docker compose -f docker/docker-compose.yml down -v  # ⚠ 删数据卷
```
