# Data Model: 重构登录页面 UI

**Feature**: 001-redesign-login-ui
**Date**: 2026-07-20

## Summary

本特性为**纯前端 UI 重构**，不引入新数据实体、不修改既有实体字段、不触及数据库 schema。

## Entities (Unchanged)

本特性沿用以下既有实体，不做任何字段或关系变更：

### User

既有的管理员账户实体。本特性仅消费其 `username` + `password` 字段（通过 better-auth 客户端 API），不直接读写 User 表。

### Session

既有的登录会话实体。本特性不修改其生命周期（创建、查询、过期由 better-auth 服务端管理）。

## Field-Level Interactions

登录页与 User 实体的字段交互（只读、通过 API）：

| 字段 | 登录页用法 | 校验 |
|------|-----------|------|
| `username` | 用户输入 → `signIn.username({ username })` | 非空（前端最小校验，spec FR-003） |
| `password` | 用户输入 → `signIn.username({ password })` | 非空（前端最小校验，spec FR-003） |

## Validation Rules

| Rule | Source | 触发点 |
|------|--------|--------|
| username 非空 | spec FR-003 | 表单提交前（antd Form rules） |
| password 非空 | spec FR-003 | 表单提交前（antd Form rules） |
| 凭据错误文案不区分用户名/密码 | spec FR-004 | 后端返回 401 时 |
| 系统错误文案与凭据错误区分 | spec FR-004 | 后端返回 5xx 或网络异常时 |

## State Transitions

本特性不涉及实体状态机变更。仅有的"状态"是登录页 UI 的局部状态：

```text
[idle]
  ├─ user input → [validating locally]
  │                  ├─ invalid → [show field error, back to idle]
  │                  └─ valid → [submitting]
  │                                  ├─ 200 → navigate to callbackUrl
  │                                  ├─ 401 → [show credential error, back to idle]
  │                                  └─ 5xx/throw → [show system error, back to idle]
```

UI 状态机仅由 React `useState` 管理（research Q3 已决策不引入状态机库）。

## Migrations

**无**。本特性不动数据库 schema，不需要 drizzle migration。宪法 v1.0.0"Schema changes MUST be paired with db:generate + db:migrate"条款不适用。

## Out of Scope

- 任何 User / Session 字段新增或修改
- 任何数据库迁移
- 任何 better-auth 配置变更（不在 apps/api 端动代码）
- 任何与 OAuth/SSO/邮箱登录/双因子相关的实体或字段（spec Assumptions 已排除）
