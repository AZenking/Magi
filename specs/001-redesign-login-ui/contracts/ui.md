# UI Contract: 登录页

**Feature**: 001-redesign-login-ui
**Date**: 2026-07-20
**Related**: [spec.md](../spec.md) FR-001/004/007/008/010/011, [research.md](../research.md) Q2/Q3

## Route

- **Path**: `/login`
- **Public**: 是（未登录可访问）
- **Authenticated redirect**: 已登录用户访问 `/login` 跳转 `/dashboard`（spec FR-006）

## Component Tree

```text
<LoginPage>                                  # apps/web/src/routes/login.tsx
└── <ConfigProvider locale={zhCN} theme={...}>  # antd 主题作用域
    └── <App>                                # antd message 上下文
        └── <div className="login-container">  # 居中布局容器
            ├── <div className="brand">       # 站点标识（FR-010）
            │   ├── <div className="logo">M</div>
            │   └── <span>MAGI</span>
            ├── <Typography.Title level={2}>登录到 MAGI</Typography.Title>
            ├── <Typography.Paragraph type="secondary">...</Typography.Paragraph>
            ├── <Alert />                     # 错误提示（条件渲染，FR-004）
            └── <LoginForm>                   # apps/web/src/components/login-form.tsx
                └── <Form name="login" layout="vertical" onFinish={handleSubmit}>
                    ├── <Form.Item name="username" label="用户名" rules=[required]>
                    │   └── <Input autoComplete="username" placeholder="admin" />
                    ├── <Form.Item name="password" label="密码" rules=[required]>
                    │   └── <Input.Password autoComplete="current-password" />
                    └── <Button type="primary" htmlType="submit" block loading={pending}>
                          登录
                        </Button>
```

## Form Behavior

| 时刻 | 行为 |
|------|------|
| 用户名/密码任一为空 | 提交按钮可见但不阻止点击；点击后 antd Form 自动展示字段下错误 |
| 用户名/密码均非空 + 用户点提交 | Button 进入 loading 状态、所有字段 disabled；调 `signIn.username` |
| 提交成功 | 跳转至 `callbackUrl` 或 `/dashboard`（`replace: true`，spec FR-005） |
| 提交返回 401 | Alert 显示"用户名或密码错误"；密码字段清空；光标聚焦密码字段（spec acceptance 1.2） |
| 提交返回 5xx | Alert 显示"登录暂时不可用，请稍后重试"；登录按钮恢复（spec acceptance 2.2） |
| 提交抛 throw（网络错） | 同 5xx 处理 |
| Alert 出现后用户再次输入 | Alert 立即消失（spec acceptance 3.3，通过 useEffect 监听表单值变化） |

## Visual Tokens (from antd v6 design.md)

| Token | 值 | 出处 |
|-------|-----|------|
| `colorPrimary` | `#1677FF` | design.md colors.primary |
| `fontSize` | `14` | design.md typography（基础字号） |
| `borderRadius` | `6` | design.md rounded.DEFAULT |
| `motionDurationMid` | `0.2s`（默认） | design.md motion |
| `fontFamily` | antd 默认 stack（不覆盖） | design.md typography |
| 页面背景 | `colorBgLayout` = `#F5F5F5` | design.md 三层 surface 模型 |
| 表单容器背景 | `colorBgContainer` = `#FFFFFF` | design.md 三层 surface 模型 |
| 错误色 | `colorError` = `#FF4D4F` | design.md colors.error |

**禁止**在源码中硬编码 `#FFFFFF` / `#FAFAFA` / `#1677FF` 等 hex（宪法 v2.2.0）。所有颜色通过 ConfigProvider theme.token 引用或 antd 内置语义 token。

## Layout Spec

```text
┌─────────────────────────────────────────────────────┐
│                     (页面背景)                       │
│                                                       │
│           ┌───────────────────────────┐              │
│           │      [M] MAGI             │  ← 站点标识 │
│           │                           │              │
│           │   登录到 MAGI              │  ← Title h2 │
│           │   输入用户名和密码以...    │  ← 副标题   │
│           │                           │              │
│           │   [⚠ Alert（条件渲染）]   │              │
│           │                           │              │
│           │   用户名                  │              │
│           │   [____________________]  │              │
│           │                           │              │
│           │   密码                    │              │
│           │   [____________________]👁│  ← Input.Password │
│           │                           │              │
│           │   [        登录        ]  │  ← Button block │
│           │                           │              │
│           └───────────────────────────┘              │
│                  (容器最大宽 400px)                  │
└─────────────────────────────────────────────────────┘
```

- 容器：`max-width: 400px`、水平居中、垂直居中（`min-height: 100svh`、`display: flex`、`align-items: center`、`justify-content: center`）
- 内边距：`padding: 24px`（design.md spacing.lg）
- 移动端：`max-width: calc(100vw - 32px)`，保证 360px 屏宽下无横向滚动（spec FR-009）

## Accessibility

- 所有 input 有显式 `<label>`（antd Form.Item 的 `label` 属性自动渲染 `<label for>`）
- 错误提示通过 `aria-live="polite"`（Alert 默认）让屏幕阅读器播报
- Tab 顺序：username → password → submit；focus ring 用 antd 默认（不覆盖 outline）
- 按钮在 loading 时 `aria-busy="true"`（antd Button 默认）

## Out of Scope

- 注册账号链接（spec Assumptions 排除）
- 忘记密码链接（spec Assumptions 排除）
- "记住我" 复选框（spec Assumptions 排除）
- 主题切换（dark mode 切换）（spec Assumptions 排除）
- 第三方登录（OAuth/SSO）（spec FR-002 明确排除）
