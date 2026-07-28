# Auth Contract: better-auth signIn.username

**Feature**: 001-redesign-login-ui
**Date**: 2026-07-20
**Related**: [spec.md](../spec.md) FR-002/004/005, [research.md](../research.md) Q4

## Client API

沿用的 better-auth 客户端调用（**完全不变**，来自 `apps/web/src/lib/auth-client.ts`）：

```ts
import { signIn } from "@/lib/auth-client";

const result = await signIn.username({ username, password });
// result: { data?: ..., error?: AuthError }
```

## Return Shape (verified by T003, 2026-07-21)

T003 用 curl 实地触发错误凭据登录，确认了 better-auth 1.6 的错误结构：

### HTTP 层（curl 验证）

```bash
POST http://localhost:3001/api/auth/sign-in/username
Content-Type: application/json
Body: {"username":"admin","password":"wrong_password"}
```

**Response**（凭据错误）：

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"message":"Invalid username or password","code":"INVALID_USERNAME_OR_PASSWORD"}
```

### 客户端层（better-auth react client 包装）

`signIn.username(...)` 返回：

```ts
type SignInResult =
  | { data: Session; error: null }
  | { data: null; error: { status: number; statusText: string; message: string; code?: string } };
```

- `error.status` = HTTP status（401 / 500 / etc.）
- `error.code` = body.code（`INVALID_USERNAME_OR_PASSWORD` 等）
- `error.message` = body.message（`Invalid username or password`）
- 网络错误（fetch throw）：`signIn.username` 直接 throw，不返回 error 对象

**T008 错误分类逻辑（已可基于此实施）**：

```ts
try {
  const { error } = await signIn.username({ username, password });
  if (error) {
    if (error.status === 401) {
      setErrorMessage("用户名或密码错误");
      form.setFieldValue("password", "");
      form.focus("password");
    } else {
      // 5xx 或其他 4xx（如 429 限流）
      setErrorMessage("登录暂时不可用，请稍后重试");
    }
    return;
  }
  // 成功跳转
  navigate({ to: callbackUrl, replace: true });
} catch {
  // 网络错（fetch throw）
  setErrorMessage("登录暂时不可用，请稍后重试");
}
```

**注**：客户端层 `error.status` 字段名基于 better-auth 1.6 公开文档；如 implementation 时发现实际为 `statusCode`，T008 代码相应调整（不影响 HTTP 层契约）。

## Error Classification

| 情况 | 判定条件 | 用户文案 | UI 反馈 |
|------|---------|---------|---------|
| 凭据错误 | `error.status === 401` | "用户名或密码错误" | Alert type=error；密码字段清空；聚焦密码 |
| 系统错误（服务端） | `error.status >= 500` | "登录暂时不可用，请稍后重试" | Alert type=error；按钮恢复 |
| 系统错误（网络） | `signIn.username` throw（无 error 对象） | "登录暂时不可用，请稍后重试" | Alert type=error；按钮恢复 |
| 其他 4xx（如 429 限流） | `error.status === 4xx && !== 401` | "登录暂时不可用，请稍后重试"（保守起见归类为系统错） | 同上 |

**安全约束**（spec FR-004）：凭据错误文案**绝不**说"用户名不存在"或"密码错误"。任何错误都不暴露用户名是否存在。

## Success Path

```ts
if (!error) {
  // data 字段含 session，但本特性不直接使用
  await navigate({ to: callbackUrl, replace: true });
}
```

## CallbackUrl Protocol (unchanged)

- 来源：URL 查询参数 `?callbackUrl=<encoded-path>`
- 读取：`Route.useSearch<{ callbackUrl?: string }>().callbackUrl`
- 默认：`"/dashboard"`
- 跳转方式：`navigate({ to: callbackUrl, replace: true })`（`replace` 避免"返回键回到登录页"）
- 安全校验：**本特性沿用现状**，不对 callbackUrl 做开放重定向校验（如 `//evil.com`）。**Risk 记录**：现状存在开放重定向潜在风险（如 callbackUrl=`//evil.com` 可能跳到外站）。spec 未明示要求修复，本特性**不**修复（保持 scope），但建议作为独立安全特性处理。

## Session Check

- 已登录判定：`useSession()` hook 返回 `{ data: session, isPending }`
- 路由级保护：`/login` 在组件挂载时检查 `session`，若已存在则 `navigate({ to: "/dashboard", replace: true })`（spec FR-006）
- 后台路由（`/dashboard` 等）的鉴权重定向不在本特性范围

## Out of Scope

- 任何服务端 better-auth 配置变更
- Session 过期时间、refresh token 策略
- 双因子认证 / OAuth / 邮箱登录
- callbackUrl 开放重定向修复（独立安全特性）
