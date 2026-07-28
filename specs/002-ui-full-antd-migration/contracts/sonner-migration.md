# sonner → antd message 迁移契约

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Related**: T003、[migration-map.md "sonner"](./migration-map.md#对话框与反馈us3b--pr4)

## 背景

apps/web 当前用 `sonner` 做全局 toast。本特性把所有 `toast.*` 调用替换为 antd v6 的 `message.*`（通过 `App.useApp()` hook）。

## sonner 调用清单（T003 探查结果）

**共 9 个文件，~46 个 toast 调用**：

| 文件 | toast 数 | 调用形式 |
|------|---------|---------|
| `features/dashboard/tasks/scheduled-tasks-section.tsx` | 5 | `toast.success("...")` / `toast.error("...", { description: err.message })` |
| `features/dashboard/epg/source-form-dialog.tsx` | 2 | `toast.error("...", { description: ... })` |
| `features/dashboard/sources/source-list-page.tsx` | 11 | `toast.success / error / ("...", { description })` 多种 |
| `features/dashboard/channels/channel-stream-dialog.tsx` | 5 | `toast.success("...")` / `toast.error("...", { description })` |
| `features/dashboard/channels/logo-upload.tsx` | 5 | `toast.error / success` |
| `features/dashboard/channels/channel-form-dialog.tsx` | 3 | `toast.success / error` |
| `routes/dashboard/epg-matching.tsx` | 4 | `toast.success / error` |
| `routes/dashboard/channels/index.tsx` | 5 | `toast.success / error` |
| `routes/dashboard/channels/$channelId.tsx` | 6 | `toast.error("...", { description })` |

## 替换规则

### 1. 通用 import 替换

```diff
- import { toast } from "sonner";
+ import { useFeedback } from "@/lib/feedback";
```

### 2. 组件内调用替换

```diff
- toast.success("源添加成功");
+ const { message } = useFeedback();
+ message.success("源添加成功");
```

**注意**：`useFeedback()` 必须在 React 组件顶部调用（它是 hook），不能在回调里调。所以模式是：

```tsx
function MyComponent() {
  const { message } = useFeedback();  // 顶部

  const handleAdd = async () => {
    try {
      await api.add(...);
      message.success("添加成功");  // 回调内用闭包变量
    } catch (err) {
      message.error("添加失败");
    }
  };
}
```

### 3. description 字段映射

sonner 的 `toast.error("...", { description: "详细信息" })` 在 antd message 中没有完全等价。两种映射：

**方案 A（推荐，简单）**：合并到 message 内容

```diff
- toast.error("源添加失败", { description: err.message });
+ message.error(`源添加失败：${err.message}`);
```

**方案 B（保留信息分层）**：用 antd `notification`（更复杂，但保留 description）

```diff
- toast.error("源添加失败", { description: err.message });
+ const { notification } = useFeedback();
+ notification.error({
+   message: "源添加失败",
+   description: err.message,
+   placement: 'topRight',
+ });
```

**默认选方案 A**（简单 + message UI 比 notification 轻）。仅当 description 是长文本（如完整堆栈）时用方案 B。

### 4. loading 调用映射

sonner 的 `toast.loading("...")` / `toast.promise(promise, {...})` → antd message 的 loading key 模式：

```diff
- toast.promise(apiCall, {
-   loading: "提交中",
-   success: "完成",
-   error: "失败",
- });
+ const key = message.loading("提交中", 0);  // 0 = 永不消失
+ try {
+   await apiCall;
+   message.success({ key, content: "完成" });
+ } catch (err) {
+   message.error({ key, content: "失败" });
+ }
```

## 新组件：`apps/web/src/lib/feedback.ts`（T020 实现）

```ts
import { App } from 'antd';

export function useFeedback() {
  const { message, notification, modal } = App.useApp();
  return { message, notification, modal };
}
```

所有需要反馈的组件都通过此 hook 拿实例。`App.useApp()` 必须在 `<App>` 内调用（PR1 后 `__root.tsx` 已注入 `<App>`）。

## PR4 替换策略（T021）

由于 9 个文件 + 46 个调用点较多，建议 PR4 时：

1. **批量替换 import**：先 `sed` 或 grep 全部替换 `import { toast } from "sonner"` → `import { useFeedback } from "@/lib/feedback"`
2. **每个文件单独改**：组件函数顶部加 `const { message } = useFeedback();`，然后把 `toast.X(...)` 改 `message.X(...)`
3. **description 字段决策**：默认合并（方案 A），长文本用 notification（方案 B）
4. **测试**：每个文件改完手动触发对应路径（如 source-list-page 的"添加源"按钮）

完成后 `grep -rn 'from "sonner"\|toast\.' apps/web/src` 应 0 输出。
