# Implementation Plan: 全量切换所有 UI 到 antd

**Branch**: `002-ui-full-antd-migration` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-ui-full-antd-migration/spec.md`

## Summary

完成宪法 v2.0.0 遗留迁移待办的**根治性落地**：把 apps/web 全部 10 个 dashboard 路由 + features/ 模块 + __root.tsx 全局资源 + packages/ui 全部 38 个 shadcn 组件全量切换到 antd v6。本特性是 001-redesign-login-ui 的扩展（从 1 页扩展到全部 12 页），技术栈选型已由宪法锁定（antd v6 + design.md token），本 plan 聚焦 4 个未定决策（packages/ui 去留、图表策略、PR 切分、混合栈方案）与组件级迁移映射。

## Technical Context

**Language/Version**: TypeScript 5.8 + React 19.1（apps/web/package.json 锁定）

**Primary Dependencies**:
- 框架：TanStack Start 1.168（Vite 7 SSR）、TanStack Router 1.170、TanStack Query 5.101、TanStack Table 8.21
- **现状 UI 栈（要全部移除）**：TailwindCSS 4 + shadcn/ui + radix-ui + class-variance-authority + clsx + tailwind-merge + lucide-react + next-themes + sonner + vaul + recharts（图表，可能保留也可能换）
- **目标 UI 栈（已锁定）**：antd 6.5.1 + @ant-design/icons 6.3.2（apps/web 已装，001 装的）；视 Q2 决策可能加 @ant-design/charts
- 状态：Zustand 5.0（全局客户端状态）；TanStack Query（服务端状态）；TanStack Form 1.33（部分表单，已在 channel-form-dialog 用）
- 认证：better-auth 1.6 + username plugin
- 反馈：sonner toast（要换 antd message）
- 表单：现状混合（shadcn Form + TanStack Form 都用），目标统一到 antd Form + TanStack Form 共存（前者负责 UI/校验/字段状态，后者负责 schema 校验/异步提交）—— 由 research Q1 决定细节

**Storage**: PostgreSQL 16 + Redis 7（既存，不在本特性范围）

**Testing**: 项目**无测试框架**。本特性沿用 001 决策（YAGNI），不引入 vitest / playwright。验证靠 grep + antd lint + 浏览器手测（12 页 × 3 断点 = 36 组合）

**Target Platform**: 现代 Chrome / Edge / Safari / Firefox 最新两个稳定版；桌面 ≥ 1280px、平板 ≥ 768px、移动 ≥ 360px

**Project Type**: 单仓多包 monorepo（Turborepo + pnpm workspace）。本特性**只动 apps/web 与 packages/ui**，不触及 apps/api / apps/worker / apps/tv

**Performance Goals**:
- apps/web bundle size 切换后**不显著增加**（移除 TailwindCSS + shadcn ~150 KB gzipped，新增 antd 全量 ~250 KB gzipped；净增 ≤ 100 KB）
- 各页面 FCP ≤ 1.5s（本地 dev 环境）
- 切换后页面交互响应 ≤ 200ms（antd Form / Table 默认性能）

**Constraints**:
- **宪法 v2.0.0 硬约束**：所有页面 0 出现 TailwindCSS / shadcn / radix-ui 关键字（spec SC-001）
- **宪法 v2.1.0 流程约束**：每个 antd 组件实现前 `antd info`、写完 `antd lint`
- **宪法 v2.2.0 视觉约束**：design.md token（14px 基础字号、4px 网格、6px 圆角、3 档动效、不硬编码 `#FFFFFF`）
- **scope 约束**：不动 apps/api / apps/worker / apps/tv / docker / 数据库 / 业务逻辑
- **功能等价约束**：切换前后用户操作步骤数 ≤ 切换前（spec SC-005）
- **路由兼容约束**：所有 URL 100% 保持不变（spec FR-006）
- **混合栈约束**：分批 PR 期间 Tailwind preflight 与 antd CSS-in-JS 共存（001 已验证局部可行，全局需复核 —— research Q4）

**Scale/Scope**:
- packages/ui 38 个组件 → 重写或删除
- apps/web 12 个路由（__root + index + login(已完成) + dashboard/index + 9 个子路由）
- apps/web/features/ 5 个模块（tasks / epg / sources / programmes / channels）
- 全局资源 4 处（__root.tsx / globals.css / vite.config.ts / components.json）
- 依赖移除 10 个（spec SC-002）
- 预计变更文件 60-80 个，新增/删除代码各约 3000-5000 行

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v2.2.0 逐条核查：

| # | 原则/条款 | 状态 | 备注 |
|---|----------|------|------|
| I | 整洁架构（分层） | ✅ 通过 | 本特性纯前端 web 层，不触及 api/worker。apps/web 内部分层：路由（routes/）→ 视图（features/）→ 组件（components/ 与 packages/ui）。迁移时维持分层，组件位置由 research Q1 决定 |
| II | 单仓多包 | ⚠️ 关键决策点 | packages/ui 去留由 research Q1 决定：(a) 删除 → apps/web 直接 import antd；(b) 保留为 antd 项目封装层。两种方案均符合 II 的"包单一职责"原则 |
| III | 领域独立 | ✅ 通过（N/A） | 本特性不触及 domain/ 层 |
| IV | 重活优先异步 | ✅ 通过（N/A） | 本特性不触及 BullMQ Worker |
| V | 端到端类型安全 | ✅ 通过 | 所有 props 严格 typing；TanStack Form 与 antd Form 的类型衔接在 research Q1 验证；`any` 禁用 |
| VI | 长期可维护性 | ⚠️ YAGNI 平衡 | 38 个组件 + 12 路由是大 scope，但每个组件迁移都是"必要工作"（非预先抽象）。关键是**分批 PR**避免一次性巨 PR（research Q3 决策粒度） |
| VII | 可观测性 | ✅ 通过（沿用 001） | antd message 替换 sonner 后，message 调用走 React Context，不走 BullMQ。前端错误用 antd Alert + Form.Item error 反馈（与 001 一致）。链路追踪（request-id 透传）留独立特性 |
| 技术栈标准 | ✅ **本特性是合规清零** | 完成本特性后，宪法 v2.0.0 "前端 UI 走 antd v6" 条款的违宪代码 = 0。这正是本特性的根本目的 |
| 开发流程：antd UI 编写流程（v2.1.0） | ✅ 承诺执行 | 每个组件实现前 `antd info` 查询（contracts/antd-api.md 已在 001 建立，本特性扩展）；写完 `antd lint` 校验 |
| 开发流程：antd 视觉语言遵循（v2.2.0） | ✅ 承诺执行 | design.md 已读，token 速查已建。本特性每个页面 / 组件的视觉决策严格按 token |
| 开发流程：spec 优先 | ✅ 通过 | 本特性已有 spec.md |
| 治理：版本策略 | ✅ N/A | 本特性不改宪法 |

**Gate 判定**：**通过**。技术栈标准条款正是本特性要落地的对象，不存在冲突。原则 VI（YAGNI）需在 PR 切分时平衡（避免过度抽象，也避免一次性巨 PR）—— 在 Complexity Tracking 记录。

## Project Structure

### Documentation (this feature)

```text
specs/002-ui-full-antd-migration/
├── spec.md                 # /speckit-specify 产出（已存在）
├── plan.md                 # 本文件
├── research.md             # Phase 0 产出（4 个决策 + 38 组件映射）
├── data-model.md           # Phase 1 产出（无新实体）
├── quickstart.md           # Phase 1 产出（12 页 × 3 断点手测 + grep + antd lint）
├── contracts/
│   ├── migration-map.md    # 38 组件 shadcn → antd 映射表
│   └── global-resources.md # __root / globals.css / vite / components.json 处理流程
└── tasks.md                # Phase 2（/speckit-tasks 产出，本命令不创建）
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── routes/
│   │   ├── __root.tsx           # 🔁 重写：ConfigProvider 提升到根 + App 包裹；移除 ThemeProvider/TooltipProvider/Toaster/globals.css
│   │   ├── index.tsx            # 🔁 重写：移除 shadcn 引用
│   │   ├── login.tsx            # ✅ 不动（001 已完成；可移除局部 ConfigProvider 因 root 已注入）
│   │   └── dashboard/           # 🔁 重写：10 个路由文件
│   │       ├── index.tsx
│   │       ├── epg-matching.tsx
│   │       ├── tasks/index.tsx
│   │       ├── tasks/$taskId.tsx
│   │       ├── sources/{channels,programmes,xmltv,m3u}.tsx
│   │       └── channels/{index,$channelId}.tsx
│   ├── features/                # 🔁 重写：5 个模块的 dialog/form/list 文件
│   │   └── dashboard/{tasks,epg,sources,programmes,channels}/
│   ├── components/              # 视 Q1 决策保留（packages/ui 删除时）或保持空
│   │   └── login-form.tsx       # ✅ 不动（001 已建）
│   ├── lib/                     # ✅ 不动（auth-client / theme / query-client）
│   └── services/                # ✅ 不动（config 等）
├── components.json              # ❌ 删除（shadcn CLI 配置）
├── package.json                 # ➖ 移除 10 个 shadcn 依赖；保留 antd/icons
└── vite.config.ts               # 🔁 改：移除 @tailwindcss/vite 插件

packages/ui/                     # ⚠️ 视 Q1 决策
├── (选项 a) 整体删除            # apps/web 直接 import antd
└── (选项 b) 重写为 antd 封装层  # 保留 38 文件但内容全换 antd 包装

docker/, apps/api/, apps/worker/, apps/tv/   # ✅ 全部不动
```

**Structure Decision**: 选用 monorepo 子项目路径（apps/web/...）。packages/ui 去留由 research Q1 决定（推荐选项 a：整体删除，理由见 research.md）。

## Complexity Tracking

> **本特性有 3 项需论证的复杂度（其余 Constitution Check 项均通过）**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 宪法 v2.0.0 已禁 Tailwind/shadcn，但本特性采用**分批 PR 渐进迁移**，跨 PR 期间允许混合栈（旧栈代码暂时存在） | 38 组件 + 10 路由 + 5 模块 + 全局资源一次性切换 = 单 PR 体量过大，无法 review、无法独立回滚；混合栈期间 Tailwind 与 antd 共存 001 已验证技术可行 | 一次性切换被否决：单 PR 60-80 文件、±5000 行不可 review；任何单点失败导致整 PR 回滚代价过大 |
| `packages/ui` 目录可能整体保留为 antd 包装层（视 Q1）而非删除 | 项目宪法 II"包单一职责"允许 packages/ui 作为"项目级 antd 封装"（主题预设、组合组件如 `LoginForm`）。但若 Q1 选删除，本复杂度自动消失 | "必须保留 packages/ui" 被否决：YAGNI；除非有具体复用需求，否则 apps/web 直接 import antd 更简单（research Q1 详述） |
| 图表组件可能保留 recharts（非 antd 生态）而非替换为 @ant-design/charts | recharts 已深度集成在 dashboard 首页 chart-area-interactive；替换为 @ant-design/charts 需重写所有图表配置；保留 recharts 但用 antd token 包装可降低工作量 | "必须替换为 @ant-design/charts" 被否决：recharts 是数据可视化库（不是 UI 组件库），不在宪法 v2.0.0 "禁止 utility-first UI 框架" 范围内；只要样式走 antd token 即合规。但 recharts 内部 className 用 Tailwind class 是违宪，需清理（research Q2 详述） |
