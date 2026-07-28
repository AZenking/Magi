# Implementation Plan: 重构登录页面 UI

**Branch**: `001-redesign-login-ui` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-redesign-login-ui/spec.md`

## Summary

把 `apps/web/src/routes/login.tsx` 从当前的 shadcn/Tailwind 栈重构为宪法 v2.2.0 锁定的 antd v6 栈。功能契约（用户名+密码登录、callbackUrl 跳转、错误反馈）保持不变；视觉按 antd v6 design.md 决策。本次重构作为 packages/ui 整体 antd 化的**首块试金石** — 仅覆盖登录页与最少的根布局接线（ConfigProvider），其余后台页继续沿用 shadcn（违宪状态由宪法 v2.0.0 迁移待办单独跟踪）。

## Technical Context

**Language/Version**: TypeScript 5.8 + React 19.1（来自 `apps/web/package.json`）。

**Primary Dependencies**:
- 框架：TanStack Start 1.168（Vite 7 SSR）、TanStack Router 1.170
- **UI 栈（重构目标）**：antd v6（CSS-in-JS）
- **UI 栈（现状，要替换）**：TailwindCSS 4 + shadcn/ui（packages/ui 全部 27+ 组件）
- 认证：better-auth 1.6 + username plugin（`signIn.username` 客户端 API）
- 表单状态：React useState（现状）/ antd Form（重构后候选，见 research）
- 反馈：sonner toast（现状）/ antd `message` + `App`（重构后候选）
- 校验：Zod 4.4（项目宪法 V 要求，但 spec FR-003 只要求"非空"最小校验）

**Storage**: PostgreSQL 16（既存，不在本特性范围）+ Redis 7（既存）。本特性**不触及**数据库与缓存。

**Testing**: 项目目前**无测试设施**（既存 `apps/web/package.json` 的 scripts 只有 dev/build/start/lint/clean，无 test）。本特性**不引入测试框架**（YAGNI，单人维护项目，登录页属纯 UI 重构，验证靠 quickstart 手测 + 浏览器对比）。如未来引入 vitest/playwright，作为独立特性。

**Target Platform**: 现代浏览器（Chrome/Edge/Safari/Firefox 最新两个稳定版）；桌面 ≥ 1280px、移动 ≥ 360px（spec FR-009）。

**Project Type**: 单仓多包 monorepo（Turborepo + pnpm workspace）下的 `apps/web` 子项目（SSR web app）。本特性**只动 `apps/web` 与必要的 `packages/ui`**，不触及 `apps/api`、`apps/worker`、`apps/tv`。

**Performance Goals**:
- 登录页 FCP（First Contentful Paint）≤ 1s（本地 dev 环境）
- 表单提交响应 ≤ 1s（前端渲染部分，spec SC-002）
- antd v6 bundle 增量 ≤ 200 KB gzipped（按需引入 Form/Input/Button/Alert/App）

**Constraints**:
- **宪法 v2.0.0 硬约束**：登录页源码 0 出现 TailwindCSS / shadcn / radix-ui 关键字（spec SC-003）
- **宪法 v2.1.0 流程约束**：编写 antd 代码前先 `antd info <Component>` 查询，写完 `antd lint`
- **宪法 v2.2.0 视觉约束**：按 antd v6 design.md 决策（14px 基础字号、4px 网格、6px 默认圆角、3 档动效、不硬编码 `#FFFFFF`）
- **依赖约束**：保留 better-auth 的 `signIn.username` 客户端 API 不变；保留 `callbackUrl` 跳转协议不变
- **scope 约束**：不动 packages/ui 其他组件（仅 LoginForm）、不动 apps/api

**Scale/Scope**: 单页面 + 1 个新组件 + 根布局最小改动。预计变更文件 4-6 个，新增/删除代码各约 100-200 行。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v2.2.0 逐条核查：

| # | 原则/条款 | 状态 | 备注 |
|---|----------|------|------|
| I | 整洁架构（分层） | ✅ 通过 | 本特性纯前端，分层只在 web 内部分（路由 / 视图 / 组件 / 服务）。`auth-client.ts` 是 Infrastructure 层，登录页是 HTTP 层，调用关系清晰。 |
| II | 单仓多包 | ✅ 通过 | LoginForm 重写位置：候选 A=`packages/ui/src/components/login-form.tsx`（重写既有）、候选 B=`apps/web/src/components/login-form.tsx`（内联）。决策见 research.md。 |
| III | 领域独立 | ✅ 通过（N/A） | 本特性不触及 domain/ 层。 |
| IV | 重活优先异步 | ✅ 通过（N/A） | 登录请求秒级返回，非长任务，不需走 BullMQ。 |
| V | 端到端类型安全 | ✅ 通过 | 所有 props 严格 typing；表单值用 FormData + 类型断言（沿用现状）或 antd Form 的泛型（research 决策）。`any` 禁用，`unknown` + 收窄。 |
| VI | 长期可维护性 | ✅ 通过 | 不预先抽象，YAGNI。不引入"未来可能用到的"配置项（如可切换登录方式）。 |
| VII | 可观测性 | ⚠️ 需关注 | 登录请求是前端→API 的同步 HTTP，**不走 BullMQ**，原则上 VII 不强制。但 spec FR-011 要求错误反馈，应在浏览器侧结构化日志（console 不行——见下）+ 网络层错误上报 API。本特性最小化：用 better-auth 客户端的 error 对象分类（凭据错误 vs 网络错误）。完整链路追踪（request-id 透传）留作独立特性。 |
| 技术栈标准 | ❌ **必须修正** | packages/ui 全部 27+ 组件、`apps/web/__root.tsx` 的 Toaster/TooltipProvider/ThemeProvider、`apps/web/globals.css` 的 Tailwind preflight **均违宪**（v2.0.0 已禁用）。本特性无法一次性清掉所有违宪代码（违反 YAGNI 与 scope）。**Decision**：本特性只清理 login.tsx + LoginForm 路径上的违宪代码，其余违宪代码由宪法 v2.0.0 遗留迁移待办跟踪。 |
| 开发流程：antd UI 编写流程（v2.1.0） | ✅ 承诺执行 | 在 Phase 2（implement）开始前，对每个用到的 antd 组件跑 `antd info <Component> --format json --version 6.x` → `antd demo <Component> basic --format json` → 写代码 → `antd lint ./apps/web/src/routes/login.tsx`。 |
| 开发流程：antd 视觉语言遵循（v2.2.0） | ✅ 承诺执行 | design.md 已读（前一阶段）。本特性的视觉决策（颜色/间距/圆角）严格按 design.md token，不硬编码。 |
| 开发流程：spec 优先 | ✅ 通过 | 本特性已有 spec.md（`/speckit-specify` 产出）。 |
| 治理：版本策略 | ✅ N/A | 本特性不改宪法。 |

**Gate 判定**：技术栈标准的违宪代码无法在本特性内一次性清除，记录为**有条件通过** — 条件是：

1. ✅ login.tsx 源码中 0 出现 Tailwind/shadcn/radix 关键字
2. ✅ LoginForm（无论位置 A 还是 B）源码中 0 出现上述关键字
3. ✅ __root.tsx 仅做最小改动以让 antd 在 /login 路由下不被 Tailwind preflight 破坏（具体方案见 research.md Q2）
4. ⚠️ packages/ui 其他 26+ 组件、__root.tsx 的 Toaster/TooltipProvider、globals.css 的 Tailwind 入口 **不在本特性清除范围** — 由宪法 v2.0.0 遗留迁移待办跟踪

## Project Structure

### Documentation (this feature)

```text
specs/001-redesign-login-ui/
├── spec.md              # /speckit-specify 产出（已存在）
├── plan.md              # 本文件（/speckit-plan 产出）
├── research.md          # Phase 0 产出
├── data-model.md        # Phase 1 产出
├── quickstart.md        # Phase 1 产出
├── contracts/           # Phase 1 产出
│   ├── ui.md            # 登录页 UI 契约（布局/组件树/状态）
│   └── auth.md          # 认证契约（沿用 signIn.username + callbackUrl）
└── tasks.md             # Phase 2（/speckit-tasks 产出，本命令不创建）
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── routes/
│   │   ├── __root.tsx       # ⚠️ 改：加 antd ConfigProvider 局部包裹（仅 /login 子树，方案见 research Q2）
│   │   ├── login.tsx        # 🔁 重写：移除 Tailwind class、shadcn LoginForm，改为 antd 实现
│   │   └── (其他路由不动)
│   ├── components/          # 新增（候选 B 路径）：login-form.tsx（antd 版）
│   ├── lib/
│   │   └── auth-client.ts   # ✅ 不动（沿用 signIn.username）
│   └── services/
│       └── config.ts        # ✅ 不动（API_BASE）
├── components.json          # ⚠️ 不在本特性删除（属于 packages/ui 整体迁移待办）
├── package.json             # ➕ 加 antd v6 依赖；保留 tailwindcss（其他页仍用）
└── vite.config.ts           # ✅ 不动（除非 antd v6 需要 babel 插件，research 决策）

packages/ui/
├── src/components/
│   └── login-form.tsx       # 候选 A 路径：原地重写为 antd（决策见 research Q1）
└── (其他 26+ 组件不动)

docker/
├── .env / .env.example      # ✅ 不动
└── docker-compose.yml       # ✅ 不动
```

**Structure Decision**: 选用 monorepo 子项目路径（apps/web/...），不动 packages/* 除非 research Q1 选候选 A。packages/ui 的其他组件遵循"YAGNI + 宪法迁移待办"原则不在本特性内触碰。

## Complexity Tracking

> **本特性有 1 项需论证的复杂度（其余 Constitution Check 项均通过）**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 宪法 v2.0.0 要求 packages/ui 全部 antd 化，本特性只重构 LoginForm，留下 26+ 违宪组件 | 一次性重写全部组件会膨胀本特性 scope 至少 5-10 倍工作量，违反 spec 的 scope 边界与宪法"长期可维护性（YAGNI/小步推进）"原则；且其他组件（sidebar/data-table 等）需要各自的 spec 与 UX 决策 | "全有或全无"重写被否决：会让本特性变成"前端栈大重构"而非"登录页 UI 重构"，违背 spec 的 P1/P2 故事（这两个故事不依赖其他页面） |
| __root.tsx 仍引入 `@magi/ui/globals.css`（含 Tailwind preflight）和 `@magi/ui/components/sonner` 等 shadcn 资源 | 移除 globals.css 会立即破坏其他后台页（sidebar/dashboard 等的样式），等同强制本特性去重写所有页面 | 全局移除被否决（同上理由）；本特性用"局部 ConfigProvider + antd App 包裹"或"路由级样式隔离"解决 /login 的样式冲突，详见 research.md Q2 |
