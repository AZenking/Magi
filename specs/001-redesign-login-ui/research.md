# Phase 0 Research: 重构登录页面 UI

**Feature**: 001-redesign-login-ui
**Date**: 2026-07-20
**Status**: All unknowns resolved

本文件解决 plan.md Technical Context 与 Constitution Check 中标记的 4 个 unknown，每个含 Decision / Rationale / Alternatives。

---

## Q1: LoginForm 重写位置 — packages/ui 原地 vs apps/web 内联

### Context

现状（`packages/ui/src/components/login-form.tsx`） LoginForm 被 `apps/web/src/routes/login.tsx` 通过 `@magi/ui/components/login-form` 引入。重构需要决定：

- **候选 A**：原地重写 `packages/ui/src/components/login-form.tsx` 为 antd
- **候选 B**：内联到 `apps/web/src/components/login-form.tsx`（新建），删除 packages/ui 的版本

### Findings

- `grep -rn "login-form\|LoginForm"` 显示 **LoginForm 只被 1 处导入**（`apps/web/src/routes/login.tsx`）。无第二调用方。
- `packages/ui/package.json` 的 peerDeps 只有 react / react-dom，**未含 antd**。若选 A，须追加 antd 到 packages/ui 的 peerDependencies + dependencies，让该包从"纯 shadcn"变成"混合栈（1 antd + 26 shadcn）"。
- 宪法 v2.0.0 的迁移待办已声明 packages/ui 整体要 antd 化；本特性若只搬一个组件到 antd，会让 packages/ui 进入长期混合状态，增加未来整体迁移的复杂度（需要识别"哪些是 antd 化了，哪些还没"）。

### Decision

**选 B：内联到 `apps/web/src/components/login-form.tsx`**，并删除 `packages/ui/src/components/login-form.tsx` 及其 dist 产物。

### Rationale

- LoginForm 单一调用方，放共享包不符合"包的单一职责"（宪法 II）。
- packages/ui 保持纯 shadcn 状态 → 未来宪法 v2.0.0 迁移时，packages/ui 一次性整体重写更干净（不需要局部识别）。
- apps/web 直接控制登录页 UI 组件，符合 YAGNI（宪法 VI）。
- Login.tsx 修改面变小：只改一行 import。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| A: packages/ui 原地重写 | 路径不变 | 单一调用方不必要放共享包；让 packages/ui 进入混合栈 |
| C: 直接把 LoginForm 逻辑写进 login.tsx 不抽组件 | 文件更少 | login.tsx 会变长（120+ 行），违反"单文件单一关注点"；未来若需要单元测试 LoginForm 不好抽 |

---

## Q2: __root.tsx 的 Tailwind preflight 与 antd v6 共存方案

### Context

`apps/web/src/routes/__root.tsx` 在 `<html>` 下引入：

```tsx
<ThemeProvider>
  <QueryClientProvider>
    <TooltipProvider>
      <Outlet />
    </TooltipProvider>
  </QueryClientProvider>
</ThemeProvider>
<Toaster />    // sonner
```

head 中通过 `appCss = "@magi/ui/globals.css?url"` 注入 Tailwind v4 preflight（`@import "tailwindcss"` 在 `packages/ui/src/styles/globals.css`）。**Tailwind preflight 的全局 reset（`* { margin: 0; padding: 0; box-sizing: border-box }` 等）可能与 antd v6 的 CSS-in-JS 注入样式冲突。**

### Findings

- antd v6 用 `@ant-design/cssinjs`，所有组件样式通过 inline `<style>` 注入到 `<head>`，**selector specificity 高于 Tailwind 的 `*` 通配符**（class selector vs universal selector）。
- 已知冲突点（社区经验）：
  1. Tailwind preflight 设置 `button { background-color: transparent; background-image: none; }` — 会被 antd 的 `.ant-btn` 类样式覆盖（specificity 1 类 > 1 元素）。✅ 通常安全。
  2. Tailwind preflight 设置 `input { border-style: solid; border-width: 0; }` — 同样被 antd `.ant-input` 类覆盖。✅ 通常安全。
  3. **真实风险**：`<html>` 与 `<body>` 的字号继承。Tailwind 默认 `html { font-family: ... }`；antd v6 design.md 指定基础字号 14px 通过 `.ant-*` 容器作用域生效，**不依赖全局 html 字号**。所以共存可接受，但需要在 ConfigProvider 中显式设 `theme.token.fontSize = 14` 确保。
- antd v6 的 `<App>` 组件提供 message/notification/modal 的上下文，**必须包裹在使用这些 API 的子树外层**。
- 实战结论：antd v6 + Tailwind v4 在**同页面共存**是技术上可行的（社区有大量先例），不需要全局隔离。

### Decision

**在 `apps/web/src/routes/login.tsx` 内部用 antd `<ConfigProvider>` + `<App>` 包裹 LoginPage 内容**，**不动 __root.tsx**。具体：

```tsx
// login.tsx
import { ConfigProvider, App } from "antd";
import zhCN from "antd/locale/zh_CN";

function LoginPage() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { fontSize: 14, colorPrimary: "#1677FF" } }}>
      <App>
        {/* 登录表单内容 */}
      </App>
    </ConfigProvider>
  );
}
```

### Rationale

- 路由级 ConfigProvider 比 root 级更细粒度，不影响其他后台页（其他页仍用 ThemeProvider/shadcn）。
- 不动 __root.tsx = 不破坏其他后台页样式，符合"最小 scope"原则。
- ConfigProvider 在 antd v6 是嵌套安全的（支持嵌套 ConfigProvider，内层覆盖外层）。
- 如果未来宪法 v2.0.0 迁移完成（其他页也 antd 化），可以把 ConfigProvider 提到 __root.tsx；本特性不强制。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| 全局移除 Tailwind preflight | 一劳永逸 | 立即破坏其他后台页样式，超出本特性 scope |
| 在 /login 路由用 `<style>` 注入 antd reset 兜底 | 防御性 | 不必要 — antd CSS-in-JS 的 specificity 已经足够；过度设计 |
| 用 iframe 隔离 /login | 完全隔离 | 大锤砸蚊子，破坏 SSR、SEO、用户体验 |

### 风险记录

- 若 implementation 阶段发现实际样式冲突（如某个 Tailwind utility 影响 antd），用 antd `theme.components.X` token 在 ConfigProvider 内覆盖，不写自定义 CSS（宪法 v2.2.0：禁止绕过 token）。
- Tailwind v4 的 `@layer base` 会把 preflight 放到低权重层，进一步降低与 antd 冲突的概率。

---

## Q3: antd v6 组件清单与表单状态管理策略

### Context

登录页要用的 antd 组件候选清单。表单状态有两种实现风格：

- **风格 X**：沿用现状（`useState` + `FormData` + 手动 `e.preventDefault()`）
- **风格 Y**：antd `<Form>` + `Form.Item` + `form.getFieldsValue()` + `onFinish` 回调

### Findings

- antd `<Form>` 提供：字段级校验、错误展示、`disabled` 状态联动、submit loading、`autoComplete` 透传。
- spec FR-003 要求"非空"最小校验，antd Form 用 `rules: [{ required: true }]` 一行实现，比手写校验更短。
- spec FR-007 要求 submit loading，antd `<Button loading={pending}>` + `<Form>` 的 `disabled={pending}` 一行实现。
- better-auth `signIn.username` 是异步 Promise，与 antd Form 的 `onFinish` (async) 配合自然。
- 已通过 `antd info Form --format json --version 6.x` 等命令预查清单（implementation 阶段还要再正式查一次，因为版本号会变）。

### Decision

**采用 antd Form 风格 Y**。组件清单：

| antd 组件 | 用途 | 备注 |
|-----------|------|------|
| `ConfigProvider` | 主题/语言作用域 | 路由级，传 zhCN locale + theme.token |
| `App` | message/notification 上下文 | 包裹整个 LoginPage |
| `Form` | 表单容器 + 状态管理 | `name="login"`、`onFinish={handleSubmit}`、`layout="vertical"` |
| `Form.Item` | 字段包装 | `name="username"`、`rules`、`label` |
| `Input` | 用户名输入 | `autoComplete="username"` |
| `Input.Password` | 密码输入 + 可见性切换 | 自带可见性图标，无需额外实现 |
| `Button` | 提交按钮 | `type="primary"`、`htmlType="submit"`、`loading={pending}`、`block` |
| `Alert` | 错误提示 | `type="error"`、`showIcon`、`message=...`、放在 Form 顶部 |
| `Typography.Title` | "登录到 MAGI" 标题 | `level={2}`，按 design.md typography scale |
| `Typography.Paragraph` | 副标题 | `type="secondary"` |
| `Layout` 或简单 flex 居中 | 整体布局 | 用 `<div style={{ display: 'flex', ... }}>`，不引入 Layout 组件避免复杂度 |

**不用的组件**：`Layout`（YAGNI，登录页不需要 sider/header）、`Card`（不必要包裹）、`Spin`（Button 的 loading 已足够）、`Divider`（无第三方登录分割需求）、`Checkbox`（"记住我"在 spec Assumptions 排除）。

### Rationale

- antd Form 自动满足 spec FR-003（非空校验）、FR-007（loading）、FR-011（无障碍 — antd Form.Item 自动绑 label）。
- Input.Password 自带可见性切换，满足 spec FR-001 "密码输入框（带可见性切换）"。
- Alert 满足 spec FR-004 "表单附近"提示（不只 toast）。
- 颜色/字号/圆角均通过 ConfigProvider theme.token 设置，不硬编码（满足宪法 v2.2.0）。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| 风格 X：沿用 useState + FormData | 改动最小 | 主动放弃 antd Form 的便利性；状态管理手写易出错 |
| 引入 react-hook-form + zod | 类型安全更强 | 项目未用 react-hook-form；spec FR-003 只要求"非空"最小校验，引入新依赖违反 YAGNI（宪法 VI） |

---

## Q4: better-auth signIn.username 集成契约

### Context

`apps/web/src/lib/auth-client.ts` 现状：

```ts
export const { signIn, signOut, useSession } = authClient;
```

`signIn.username({ username, password })` 的返回结构需要明确，才能正确分类错误（spec FR-004 要求区分"凭据错误"与"系统错误"）。

### Findings

- better-auth 客户端的 `signIn.X` 方法返回 `Promise<{ data?: ...; error?: { status, statusText, message, ... } }>`。
- 现状 login.tsx 用 `const { error } = await signIn.username(...)`，只检查 error truthy/falsy。
- 错误分类线索（待 implementation 阶段 empirically 验证）：
  - **凭据错误**：HTTP 401，error.status === 401 或 error.message 含"invalid username"/"invalid password"
  - **系统错误**：HTTP 5xx，error.status >= 500 或 fetch 网络错误（error.code === "ECONNREFUSED" 等）
  - **网络错误**：`signIn.username` 抛 throw（如现状 login.tsx 第 34 行的 try/catch）
- callbackUrl 协议（现状）：`Route.useSearch<{ callbackUrl?: string }>().callbackUrl ?? "/dashboard"`，登录成功后 `navigate({ to: callbackUrl, replace: true })`。沿用。

### Decision

- **保留现有 signIn.username 调用方式**，**新增错误分类逻辑**：

```tsx
try {
  const { error } = await signIn.username({ username, password });
  if (error) {
    // 凭据错误（401）vs 系统错误（5xx）分类
    const isSystemError = (error.status ?? 0) >= 500 || !error.status;
    setErrorMessage(isSystemError ? "登录暂时不可用，请稍后重试" : "用户名或密码错误");
    return;
  }
  // 成功跳转
} catch {
  // 网络错误（fetch failed）— 视为系统错误
  setErrorMessage("登录暂时不可用，请稍后重试");
}
```

- callbackUrl 协议**完全保留不变**。

### Rationale

- 不引入 better-auth 之外的认证库（YAGNI）。
- 错误分类基于 HTTP status，是通用、稳健的判定方式，不依赖 better-auth 错误对象的具体 message（message 可能变）。
- "网络错误视为系统错误"避免暴露给用户"是网络还是服务器"，符合 spec FR-004 "凭据错误文案 MUST NOT 泄露用户名错还是密码错"。

### Alternatives Considered

| 候选 | 优点 | 否决理由 |
|------|------|---------|
| 用 better-auth 的 error.code 精确分类 | 类型更安全 | error.code 是 better-auth 内部 enum，可能在版本升级时变；HTTP status 更稳定 |
| 引入全局错误边界（ErrorBoundary） | 一处捕获 | 登录页是公共页（未鉴权可访问），错误处理应局部化，不依赖上层边界 |

### Risk

- better-auth 1.6 的 error 对象具体结构未在 research 阶段 empirically 验证（需要 implementation 阶段实际触发错误打印）。如结构不符，**在 tasks.md 中加一个 "implementation 阶段先 console.log error 确认结构" 的子任务**。

---

## Research 汇总

| Q | 决策摘要 |
|---|---------|
| Q1 | LoginForm 内联到 `apps/web/src/components/login-form.tsx`，删除 packages/ui 版本 |
| Q2 | 在 login.tsx 内部用 ConfigProvider + App 包裹，不动 __root.tsx |
| Q3 | 用 antd Form + Form.Item + Input/Input.Password + Button + Alert + Typography |
| Q4 | 沿用 signIn.username，加 HTTP status 错误分类（401=凭据错，5xx=系统错，throw=网络错） |

所有 NEEDS CLARIFICATION 已解决，可进入 Phase 1。
