# Global Resources: 全局资源处理流程

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Related**: [research.md Q4](../research.md#q4-混合栈期间-tailwind-preflight-与-antd-全局共存方案)（两阶段时序决策）

本文档定义 __root.tsx / globals.css / vite.config.ts / components.json / package.json 5 处全局资源的迁移时序与目标状态。

## 时序总览

```text
PR1 (US1)
├─ __root.tsx 重写：ConfigProvider + App 提升到根
├─ 保留：globals.css 引入 + ThemeProvider + TooltipProvider + Toaster
│  （混合栈期间 shadcn 页面仍需 Tailwind preflight）
└─ login.tsx：可移除局部 ConfigProvider（root 已注入）

PR2-PR6 (US2-US4)
├─ 各组件文件迁移：apps/web/src/features/* 与 apps/web/src/routes/dashboard/*
├─ 删除 packages/ui/src/components/* 对应文件（边迁边删）
└─ 全局资源不动（混合栈持续）

PR7 (US5 清算)
├─ __root.tsx 移除：globals.css 引入 + ThemeProvider + TooltipProvider + Toaster
├─ globals.css 删除（packages/ui/src/styles/globals.css）
├─ vite.config.ts 移除：@tailwindcss/vite 插件
├─ components.json 删除（packages/ui 与 apps/web 两处）
├─ package.json 移除：10 个 shadcn 依赖
└─ packages/ui 目录整体删除
```

## __root.tsx 目标状态（PR7 完成后）

**当前（违宪状态）**：

```tsx
import { Toaster } from "@magi/ui/components/sonner";
import { TooltipProvider } from "@magi/ui/components/tooltip";
import { ThemeProvider } from "@/lib/theme";
import appCss from "@magi/ui/globals.css?url";

function RootComponent() {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
```

**目标状态（PR7 后）**：

```tsx
import { ConfigProvider, App } from "antd";
import zhCN from "antd/locale/zh_CN";
import { QueryClientProvider } from "@tanstack/react-query";

const antdTheme = {
  token: {
    colorPrimary: "#1677FF",
    fontSize: 14,
    borderRadius: 6,
    colorBgLayout: "#F5F5F5",
    colorBgContainer: "#FFFFFF",
  },
};

function RootComponent() {
  return (
    <html lang="zh-CN">
      <head><HeadContent /></head>
      <body>
        <ConfigProvider locale={zhCN} theme={antdTheme}>
          <App>
            <QueryClientProvider client={queryClient}>
              <Outlet />
            </QueryClientProvider>
          </App>
        </ConfigProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

**移除的依赖**：
- `@magi/ui/components/sonner`（Toaster）
- `@magi/ui/components/tooltip`（TooltipProvider）
- `@/lib/theme`（ThemeProvider，next-themes 包装）
- `@magi/ui/globals.css?url`（Tailwind preflight 入口）

**保留**：
- `QueryClientProvider`（TanStack Query，不变）
- `HeadContent` / `Scripts`（TanStack Start SSR，不变）

**login.tsx 调整**：
- 001 时 login.tsx 内部包了局部 ConfigProvider（因 root 未注入）
- PR1 后 root 已注入 ConfigProvider，login.tsx 可移除局部 ConfigProvider，但**保留** App（message 上下文，未来 login 用 message 替代 Alert 时需要）
- 或者更激进：login.tsx 完全平铺，依赖 root 的 ConfigProvider + App

## globals.css 处理

**当前**：`packages/ui/src/styles/globals.css` 内容是 Tailwind v4 入口（`@import "tailwindcss";` + shadcn CSS variables）。

**处理**：
- PR1-PR6：**保留**（混合栈期间 shadcn 页面需要）
- PR7：**删除整个文件**（同时删除 packages/ui/src/styles/ 目录）

**导出路径影响**：
- packages/ui/package.json 的 `"./globals.css": "./src/styles/globals.css"` 导出声明在 PR7 删除
- apps/web/__root.tsx 的 `import appCss from "@magi/ui/globals.css?url"` 在 PR7 移除
- 头部 `<links>` 中 `{ rel: "stylesheet", href: appCss }` 在 PR7 移除

## vite.config.ts 处理

**当前**：

```ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => {
  const config = {
    plugins: [tsConfigPaths(), tanstackStart(), react(), tailwindcss()],
  };
  // ...
});
```

**PR7 目标**：

```ts
export default defineConfig(({ command }) => {
  const config = {
    plugins: [tsConfigPaths(), tanstackStart(), react()],
  };
  // ...
});
```

**移除**：
- `import tailwindcss from "@tailwindcss/vite";`
- `plugins` 数组中的 `tailwindcss()`

## components.json 处理

**当前**：两个文件
- `packages/ui/components.json`（shadcn CLI 配置，告诉 CLI 组件放哪）
- `apps/web/components.json`（同上）

**PR7 目标**：两个文件**都删除**。shadcn CLI 不再使用。

## package.json 依赖处理

### apps/web/package.json

**移除 dependencies**（PR1-PR7 渐进）：

```diff
- "@magi/ui": "workspace:*",       // PR7 删（packages/ui 目录删后无法 workspace link）
- "@magi/utils": "workspace:*",    // 评估（视 packages/utils 是否保留）
```

**移除 dependencies（shadcn 生态，PR1-PR7 渐进）**：

```diff
- "sonner": "^2.0.7",              // PR4 移除（被 antd message 替代）
- "next-themes": "^0.4.6",         // PR7 移除（ThemeProvider 删除时）
```

**移除 devDependencies（PR7 一次性）**：

```diff
- "@tailwindcss/vite": "^4.1.8",
- "tailwindcss": "^4.1.8",
```

**保留**：
- `antd` `^6.x` ✅
- `@ant-design/icons` `^6.x` ✅
- `react` / `react-dom` ✅
- TanStack 全家桶 ✅
- better-auth ✅
- `zustand` ✅
- `zod` ✅
- `recharts` ✅（Q2 决定保留）
- `lucide-react` ✅（图标库，不视为 UI 框架，可保留作 antd icons 补充）

### packages/ui/package.json

**PR7 整体删除**（随 packages/ui 目录）。

### 根 package.json

不动（devDependencies 含 typescript-eslint / eslint / prettier / turbo / typescript，与 UI 栈无关）。

## Tailwind preflight 与 antd CSS-in-JS 共存（PR1-PR6）

### 验证已安全

001 已实测：/login 页面用 ConfigProvider 局部包裹 + antd CSS-in-JS 与全局 Tailwind preflight 共存，无视觉冲突。本特性扩展该验证到 root 级别（PR1 后所有页面都被 ConfigProvider 包）。

### 已知潜在冲突点

1. **`button` 元素全局 reset**：Tailwind preflight 设 `button { background-color: transparent; }`，antd Button 用 `.ant-btn` class 覆盖（specificity 1 类 > 1 元素）。
2. **`input` 元素全局 reset**：同上，antd `.ant-input` 覆盖。
3. **`*` 全局 `box-sizing: border-box`**：antd 组件兼容此 reset，无影响。
4. **字体继承**：Tailwind preflight 设 `html { font-family: ... }`，antd v6 不依赖全局 html 字号（fontSize token 作用于 `.ant-*` 容器）。

**Mitigation**：
- 各 PR 完成后跑浏览器手测（quickstart.md 列 36 个组合）
- 发现具体冲突用 antd `theme.components.X` token 微调（不写自定义 CSS）
- 实在无法用 token 解决的冲突，记录到 plan.md Complexity Tracking，由独立特性处理

## Tailwind preflight 移除（PR7）后验证

PR7 完成后跑全量 grep + antd lint + 浏览器全量走查：

1. `grep -rE 'tailwindcss|@tailwindcss|@import "tailwindcss"|className="(flex|grid|bg-|text-|p-|m-|gap-|w-|h-)' apps/ packages/` — **0 输出**
2. `grep -rE 'shadcn|radix-ui|@/components/ui/|@magi/ui/components/' apps/ packages/` — **0 输出**
3. `pnpm --filter @magi/web list 2>&1 | grep -E 'tailwind|radix|shadcn|sonner|vaul|next-themes|class-variance|clsx|tailwind-merge'` — **0 输出**
4. `antd lint apps/web/src --format json` — **0 violation**
5. 浏览器走查 12 页面 × 3 断点 = 36 组合（quickstart.md）

## Out of Scope

- `apps/api/*` 任何文件（不动）
- `apps/worker/*` 任何文件（不动）
- `apps/tv/*`（尚未启动）
- `docker/*` 任何文件（不动）
- `scripts/*` 任何文件（不动）
- 数据库 schema / migration（不动）
- API endpoint 契约（不动）
