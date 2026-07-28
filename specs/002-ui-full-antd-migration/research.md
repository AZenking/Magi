# Phase 0 Research: 全量切换所有 UI 到 antd

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Status**: All unknowns resolved

本文件解决 plan.md 标记的 4 个 unknown + 提供 38 个组件的 shadcn → antd 映射表。

---

## Q1: packages/ui 去留 — 整体删除 vs 保留为 antd 项目封装层

### Context

packages/ui 当前 38 个组件全是 shadcn 复制源码（不是 npm 依赖），被 apps/web 通过 `@magi/ui/components/*` 引用。001 已经把 LoginForm 从 packages/ui 内联到 apps/web/src/components/。

### Findings

- `grep -rn '@magi/ui' apps/` 显示 packages/ui 只被 apps/web 用，没有跨 app 复用（apps/tv 尚未启动，apps/api/worker 是后端不用 UI）。
- packages/ui/components.json 是 shadcn CLI 配置，仅在添加新 shadcn 组件时用。删 packages/ui 后该文件一并清除。
- packages/ui 的构建产物（dist/）当前只服务于"workspace 包"导入路径，删除后 apps/web 直接从 antd npm 包导入，不再走 dist/。
- 001 验证了 LoginForm 内联模式可行（apps/web/src/components/login-form.tsx），无回归。
- antd 本身就是设计系统，提供主题预设（ConfigProvider theme.token）与组件级 token 覆盖（theme.components.X），**不需要项目级"再封装"层**。

### Decision

**选 a：整体删除 packages/ui**。apps/web 直接 import antd 与 @ant-design/icons；项目级复用组件（如 LoginForm、未来可能的 PageHeader）放在 apps/web/src/components/。

### Rationale

- **YAGNI**（宪法 VI）：apps/tv 尚未启动，"未来跨 app 复用"是假想需求；不预先抽象。
- **单一职责**（宪法 II）：packages/ui 当前职责模糊（既是 shadcn 容器又是组件源），删除后 monorepo 更干净。
- **构建链简化**：移除 packages/ui 的 tsc 构建、dist 产物、tsup 配置等（如果有），Turborepo 流水线少一个 target。
- **001 已铺路**：LoginForm 内联模式已验证，本特性扩展该模式到所有组件。
- 项目级组件位置已有：apps/web/src/components/（001 建），未来扩展无阻力。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| b: 保留为 antd 项目封装层（38 文件全重写） | 为 apps/tv 预留复用层；项目级主题预设集中 | YAGNI；维护成本高；apps/tv 是假想需求； LoginForm 内联模式已证明 apps/web/src/components/ 够用 |

### Impact

- packages/ui 整体目录 + dist/ + components.json + tsconfig.json + package.json 全部删除
- apps/web/package.json 移除 `"@magi/ui": "workspace:*"` 依赖
- apps/web 所有 `import ... from "@magi/ui/components/*"` 改为 `import ... from "antd"` 或 `import ... from "@/components/*"`（项目级组件）
- `globals.css?url` 这个引入（在 __root.tsx）一并移除

---

## Q2: 图表组件策略 — @ant-design/charts 替换 vs 保留 recharts

### Context

`packages/ui/src/components/chart-area-interactive.tsx` 与 `chart.tsx` 用 recharts 实现数据可视化，被 dashboard 首页 section-cards 与其他图表位置用。

### Findings

- recharts 是 React 数据可视化库（SVG-based），**不是 UI 组件库**。宪法 v2.0.0 禁令针对的是 "utility-first 样式框架（TailwindCSS）" 与 "复制源码型组件库（shadcn/radix-ui）"，**不针对数据可视化库**。
- @ant-design/charts 是 antd 生态的图表库（基于 G2/G2Plot），与 antd 视觉完全一致，但 API 与 recharts 完全不同（配置驱动 vs 组件驱动）。
- 替换工作量评估：chart-area-interactive 涉及 4-5 种图表类型（折线、柱状、面积、饼图等），每种的 config 都要重写，单文件工作量约 2-4 小时。
- recharts 现状中**确实存在 Tailwind className**（如 `<div className="grid grid-cols-...">`），这部分违宪，必须清理 —— 但这是"清理 className"而非"换库"。
- recharts 默认色板可被 antd token 覆盖（用 `useToken()` 拿 `colorPrimary` 等，传给 recharts 的 `<ResponsiveContainer>` 或子组件）。

### Decision

**选 b：保留 recharts**。所有 recharts 内部 className 清除（替换为内联 style + antd token），颜色与字体通过 `useToken()` 注入。

### Rationale

- **不在禁令范围**：recharts 不是 UI 组件库，是数据可视化库。宪法 v2.0.0 禁令针对"UI 框架"，不针对"图表引擎"。
- **YAGNI**：@ant-design/charts 替换工作量大（2-4 小时/文件 × 5+ 文件 = 10-20 小时），收益边际（视觉一致性提升有限）。
- **可合规**：只要 recharts 内部 className 走 antd token（而非 Tailwind class），即满足宪法 v2.0.0 的"0 Tailwind class"硬约束（spec SC-001）。
- 未来真有视觉一致性痛点，再起独立特性换 @ant-design/charts。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| a: 替换为 @ant-design/charts | 与 antd 视觉完全一致；API 走 antd 范式 | 工作量大；recharts 已深度集成；@ant-design/charts 文档不如 recharts 成熟 |

### Compliance Note

recharts 保留**不等于**"可以保留 Tailwind class"。所有 recharts 用法必须：
- 移除 `className="..."` 形式的 Tailwind utility
- 用 `useToken()` 拿颜色/字号，传给 recharts 的 `stroke` / `fill` / `fontSize` 等 SVG 属性
- 容器布局用内联 style + antd Layout/Row/Col，不用 grid utility

spec SC-001 grep 命令同时扫描 recharts 相关文件，0 Tailwind class 才通过。

---

## Q3: PR 切分粒度 — 5 PR / 7 PR / 10+ PR

### Context

spec 定义 5 个 user story，每个对应一个 PR 是 5 PR 方案。但 US3（表单与反馈组件 ~15 个组件）与 US4（数据浏览 ~10 个组件 + 9 个路由页）单 PR 体量过大（每 PR 1000-2000 行变更），review 困难。

### Findings

- 单 PR 最优体量：500-1000 行 diff、5-15 文件（GitHub review 经验值）。
- US3 + US4 拆细后，单 PR 可压到 300-800 行。
- 跨 PR 混合栈期间，shadcn 与 antd 共存（Q4 验证安全）。

### Decision

**选方案 C：7 个 PR**，按"user story + 组件子类型"双重切分。

| PR | User Story | 范围 | 预估行数 |
|----|-----------|------|---------|
| PR1 | US1 | __root.tsx 提升 ConfigProvider + App；移除 ThemeProvider/TooltipProvider（暂留 globals.css 与 Tailwind） | 200-300 |
| PR2 | US2 | 导航骨架：sidebar/app-sidebar/site-header/breadcrumb/nav-* 7 个组件 + 受影响路由 | 500-800 |
| PR3 | US3a | 基础表单组件：button/input/textarea/select/checkbox/label/field/toggle/toggle-group 9 个 + 受影响 features | 400-600 |
| PR4 | US3b | 对话框与反馈：dialog/alert-dialog/drawer/sheet/sonner/tooltip/skeleton/skeleton/collapsible 9 个 + message 替换 | 400-600 |
| PR5 | US4a | 数据展示：table/data-table 系列 4 个 + avatar/badge/card/tabs/separator 6 个 | 500-800 |
| PR6 | US4b | 图表清理 + 10 个 dashboard 路由页 + features 模块（5 个）切换 | 800-1500 |
| PR7 | US5 | 移除 Tailwind preflight + globals.css + components.json + 10 个 shadcn 依赖；删 packages/ui 目录；grep 全量验证 | 300-500 |

总计 ~3100-5100 行 diff，7 个 PR。

### Rationale

- 每 PR 体量适中（500-1000 行），可独立 review、独立部署、独立回滚。
- PR1-PR6 允许混合栈（Q4 验证安全）；PR7 是"清算日"，必须所有迁移完才能跑。
- 依赖关系清晰：PR1 阻塞所有后续（ConfigProvider 提升是基础）；PR2-PR6 之间相对独立（各自迁移不同组件类型，无强依赖）；PR7 依赖所有前序 PR 合并。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| A: 5 PR（按 user story） | 切分简洁 | US3/US4 单 PR 过大（>1500 行），review 困难 |
| B: 10+ PR（按组件子类型更细） | 单 PR 最小 | review 次数多，跨 PR 跟踪成本高；混合栈期长 |

---

## Q4: 混合栈期间 Tailwind preflight 与 antd 全局共存方案

### Context

001 已验证"局部 ConfigProvider + App 包裹"在 Tailwind preflight 下可行（__root.tsx 仍引 globals.css）。但本特性 PR1 要把 ConfigProvider 提升到 root，覆盖所有页面（含未迁移的 shadcn 页）。需评估：

1. antd ConfigProvider 包裹 shadcn 组件，是否影响 shadcn 样式？
2. Tailwind preflight 何时安全移除？

### Findings

- **antd ConfigProvider 不影响非 antd 组件**：通过 React Context + CSS-in-JS（`@ant-design/cssinjs`）注入主题；所有运行时样式都通过 `.ant-*` class scope，不写全局 selector。shadcn 组件用 `.cn()` + Tailwind class，不被 antd Context 干扰。
- **Tailwind preflight 是全局 reset**（`* { margin: 0; box-sizing: border-box; ... }`），shadcn 组件依赖它工作。**移除 preflight = shadcn 页面立即坏**。
- antd v6 的 reset 是组件级（每个 antd 组件自带样式），**不需要全局 preflight**。
- 已知冲突点（社区经验）：antd Button 的 `border-radius` 可能被 Tailwind preflight 的 `button { ... }` 影响，但通过 `.ant-btn` class specificity 覆盖。001 实测无问题。

### Decision

**两阶段时序**：

**阶段 1（PR1-PR6，混合栈）**：
- PR1 提升 ConfigProvider + App 到 __root.tsx，**保留** globals.css 与 Tailwind preflight
- shadcn 页面继续靠 Tailwind preflight 工作
- antd 页面（001 的 /login + 后续迁移的页）靠 antd CSS-in-JS 工作
- 两套样式系统并行，互不干扰

**阶段 2（PR7，清算日）**：
- 所有 shacn 组件已迁移完毕
- 移除 globals.css + Tailwind preflight + @tailwindcss/vite 插件 + 10 个 shadcn 依赖
- 移除 packages/ui 整个目录
- 跑全量 grep + antd lint 验证 0 残留

### Rationale

- **避免大爆炸**：阶段 2 必须在阶段 1 全部完成后才能触发，否则 shadcn 页面立即坏。
- **降低风险**：每 PR 独立部署，混合栈期间系统始终可用（部分页 antd、部分页 shadcn）。
- **回滚粒度小**：任何 PR 失败，单独回滚不影响其他。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| 一次性移除 Tailwind（PR1 同时做） | 立即清零违宪代码 | 所有 shadcn 页面立即坏；必须等所有迁移完才能做 |
| 全程保留 Tailwind（不删 preflight） | 零风险 | 永久违宪；spec SC-001/SC-002 无法满足 |

### Risk

- 混合栈期间 Tailwind preflight 的 `* { box-sizing: border-box }` 可能影响 antd 组件的 box model 计算少量场景。**Mitigation**：001 已验证 /login 页面无问题；混合栈期间各 PR 完成后跑浏览器手测，发现问题用 antd `theme.components.X` token 微调，不写自定义 CSS。

---

## 38 组件 shadcn → antd 映射表

详细实现指引见 [contracts/migration-map.md](./contracts/migration-map.md)，此处仅摘要：

| 类别 | shadcn 组件 | antd 等价物 | 工作量 |
|------|------------|-------------|--------|
| **导航（US2）** | app-sidebar / sidebar / site-header | Layout.Sider / Layout.Header | 中 |
| | breadcrumb | Breadcrumb | 低 |
| | nav-main / nav-documents / nav-secondary | Menu (items 内嵌于 Sider) | 中 |
| | nav-user | Dropdown + Avatar | 中 |
| **表单基础（US3a）** | button | Button | 低 |
| | input / textarea | Input / Input.TextArea | 低 |
| | select | Select | 低 |
| | checkbox | Checkbox | 低 |
| | label | Form.Item 的 label 属性（无需单独组件） | 低 |
| | field | Form.Item | 低 |
| | toggle | Switch 或 Button(type=text) | 低 |
| | toggle-group | Segmented | 低 |
| **对话框与反馈（US3b）** | dialog | Modal | 低 |
| | alert-dialog | Modal.warning 或 useModal | 中 |
| | drawer / sheet | Drawer (placement=right/left) | 低 |
| | sonner | message (App.useApp() hook) | 中 |
| | tooltip | Tooltip | 低 |
| | skeleton | Skeleton | 低 |
| | collapsible | Collapse | 低 |
| **数据展示（US4a）** | table | Table | 中 |
| | data-table | Table + TanStack Table | 中 |
| | data-table-column-header | 自定义（Tooltip + Dropdown） | 中 |
| | data-table-pagination | Pagination | 低 |
| | data-table-view-options | 自定义（Checkbox + Dropdown） | 中 |
| | avatar | Avatar | 低 |
| | badge | Badge | 低 |
| | card | Card | 低 |
| | tabs | Tabs | 低 |
| | separator | Divider | 低 |
| **图表（US4b）** | chart / chart-area-interactive | recharts（保留，清理 className） | 中 |
| **其他（US4b）** | section-cards | 重组为 Card 网格 | 中 |

**总计**：38 个组件，工作量评估"低"=0.5-1 小时、"中"=1-3 小时、"高"=3-6 小时。预估总工作量 50-80 小时（含浏览器手测与 PR review）。

---

## Research 汇总

| Q | 决策摘要 |
|---|---------|
| Q1 | packages/ui 整体删除；apps/web 直接 import antd；项目级组件放 apps/web/src/components/ |
| Q2 | recharts 保留；清理内部 Tailwind className，颜色走 useToken；不换 @ant-design/charts |
| Q3 | 7 个 PR：PR1 根布局 → PR2 导航 → PR3 表单基础 → PR4 对话框反馈 → PR5 数据展示 → PR6 图表+路由 → PR7 清算 |
| Q4 | 两阶段时序：PR1-PR6 混合栈（ConfigProvider 提升 + 保留 Tailwind），PR7 清算（移除 Tailwind + 删 packages/ui） |
| Q5 | **packages/utils 保留**（pino logger + date + pagination 业务工具，与 UI 无关；不违宪）。implementation 时 T050 不删 packages/utils。 |

所有 NEEDS CLARIFICATION 已解决，可进入 Phase 1。

---

## Q5: packages/utils 去留

### Context

monorepo 还有 packages/utils（apps/web 通过 `@magi/utils` 引入），tasks.md T050 提到"视评估"。需明确决策。

### Findings

T002 阶段实测：`packages/utils/src/` 含 4 个文件：

- `date.ts`（439 B）：日期格式化工具
- `pagination.ts`（519 B）：分页计算工具
- `logger.ts`（1.8 KB）：基于 pino 的 logger
- `index.ts`（80 B）：barrel export

`packages/utils/package.json` 含 `pino: ^10.3.1` 依赖（日志库，与 UI 无关）。

`grep -rn '@magi/utils' apps/web/src` 当前 0 输出 —— 前端未用，但**后端**（apps/api / apps/worker）可能用（未在本特性 grep 范围）。

### Decision

**保留 packages/utils**。T050 不删。

### Rationale

- packages/utils 是**业务工具集合**（日期、分页、日志），不是 UI 工具，不在宪法 v2.0.0 禁令范围。
- 含 pino 日志库，明显服务于后端（apps/api / apps/worker），不能删。
- 即便前端目前不用，未来 apps/web 调日志或日期格式化时会用到。
- 宪法 II（单仓多包单一职责）允许 packages/utils 存在（职责单一：工具函数）。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| 删除 | 简化 monorepo | 丢失 pino logger（后端依赖）；破坏 apps/api / apps/worker |
| 内联到 apps/web/src/lib/ | 前端更近 | 后端无法用；pino 是后端库 |

### Action

T050 描述里的 `"@magi/utils": "workspace:*"`（视评估）→ **改为明确保留**。implementation 时不动 packages/utils。
