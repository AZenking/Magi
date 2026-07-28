# antd v6 组件 API 速查（本特性用到的）

**Feature**: 001-redesign-login-ui
**Generated**: 2026-07-21 by T002
**antd version**: 6.5.1（CLI: `@ant-design/cli` 6.5.1）
**Query method**: `antd info <Component> --format json --version 6.x`

本文档是 T002 产出，列出本特性要用的 antd v6 组件及其**关键 props**（不完整 dump）。完整 API 用 `antd info <Component>` 或 `antd doc <Component> --lang zh` 现场查。

---

## Form + Form.Item

**Form** 描述：High-performance form component with data domain management.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `name` | string | — | 表单名（用于 sessionStorage 持久化等） |
| `layout` | `horizontal` \| `vertical` | — | 字段标签位置；本特性用 `vertical` |
| `onFinish` | function(values) | — | 校验通过后的提交回调；values 类型推断自 Form.Item 的 name |
| `onValuesChange` | function(changed, all) | — | 字段值变化回调；本特性 T009 用它清错误 Alert |
| `disabled` | boolean | false | 全表单禁用（含所有子 Input/Button）；T004 用于 pending 状态 |
| `form` | FormInstance | — | useForm() 返回的实例；T008 用于程序化 setFieldValue / focus |
| `initialValues` | object | — | 初始值 |
| `component` | ComponentType \| false | form | 包裹元素；默认 `<form>`，可设为 `false` 用 `<div>` |

**Form.Item** 关键 props（不在 `antd info Form` 输出里，按 antd v6 文档）：

| Prop | Type | 用途 |
|------|------|------|
| `name` | string | 字段名（同时是 onFinish values 的 key） |
| `label` | ReactNode | 字段标签（自动渲染 `<label for>` 关联） |
| `rules` | Rule[] | 校验规则；本特性用 `{ required: true, message: "..." }` |
| `help` | ReactNode | 自定义帮助文本 |
| `validateStatus` | `success` \| `warning` \| `error` \| `validating` | 强制校验状态 |
| `hasFeedback` | boolean | 显示校验图标 |

---

## Input + Input.Password

**Input** 描述：Through mouse or keyboard input content, it is the most basic form field wrapper.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `type` | string | `text` | 本特性用户名 Input 用默认 `text` |
| `variant` | `outlined` \| `borderless` \| `filled` \| `underlined` | `outlined` | 视觉风格；保持默认 |
| `status` | `error` \| `warning` | — | 强制校验状态 |
| `disabled` | boolean | false | 禁用 |
| `id` | string | — | 显式 id（Form.Item 会自动传） |
| (`placeholder`, `autoComplete`) | React 原生属性 | — | 从 commonProps 继承 |

**Input.Password** 子组件（本特性密码字段）：

| Prop | Type | Default | 备注 |
|------|------|---------|------|
| `visibilityToggle` | boolean \| VisibilityToggle | **true** | **默认开启可见性切换**，无需显式设置（满足 spec FR-001） |

---

## Button

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `type` | `primary` \| `dashed` \| `link` \| `text` \| `default` | `default` | T004 用 `primary` |
| `htmlType` | `submit` \| `reset` \| `button` | `button` | T004 用 `submit` |
| `loading` | boolean \| { delay, icon } | false | T004 用于 pending |
| `block` | boolean | false | T004 用 `block`（按钮占满父宽） |
| `disabled` | boolean | false | 与 loading 配合 |
| `size` | `large` \| `middle` \| `small` | `middle` | 默认 |
| `shape` | `default` \| `circle` \| `round` | `default` | 默认 |
| `icon` | ReactNode | — | 按钮内图标 |

---

## Alert

**描述**：Display warning messages that require attention.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `type` | `success` \| `info` \| `warning` \| `error` | `info`（banner 模式默认 `warning`） | T007 用 `error` |
| `showIcon` | boolean | false（banner 模式默认 true） | T007 显式 `showIcon`，不依赖颜色 |
| `message` | ReactNode | — | 主消息（spec FR-004 要求的"凭据错"文案） |
| `description` | ReactNode | — | 副消息（本特性不用） |
| `banner` | boolean | false | banner 模式（无边框、占满宽度）；T007 评估用 |
| `closable` | boolean \| ClosableType | false | 关闭按钮；本特性不用（错误自动消失由 T009 实现） |
| `action` | ReactNode | — | 右侧操作按钮（本特性不用） |

**aria-live**：Alert 默认 `aria-live="polite"`，屏幕阅读器播报（spec FR-011）。

---

## App

**描述**：Application wrapper for some global usages.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `component` | ComponentType \| false | `div` | 包裹元素 |
| `message` | MessageConfig | — | message 上下文配置 |
| `notification` | NotificationConfig | — | notification 上下文配置 |

**用途**：T005 用 `<App>` 包裹 LoginPage 内容，提供 `message.xxx()` 的 React Context（本特性 T007 用 Alert 而非 message，但 `<App>` 包裹是无害的最佳实践，为未来扩展留口）。

---

## ConfigProvider

**描述**：Global config component.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `theme` | Theme | — | 主题；本特性 T012 设 `theme.token` 完整 5 项（colorPrimary/fontSize/borderRadius/colorBgLayout/colorBgContainer） |
| `locale` | object | — | 国际化；T005 用 `zhCN` from `antd/locale/zh_CN` |
| `prefixCls` | string | `ant` | 类名前缀（默认） |
| `componentDisabled` | boolean | — | 全局禁用 |

**关键能力**：ConfigProvider 支持**嵌套**（内层覆盖外层），T005 的 ConfigProvider 是 `/login` 路由局部，不影响其他后台页。`theme.useToken()` hook 必须在 ConfigProvider 内部调用（T005 把 LoginPage 拆双层的原因）。

---

## Typography (Title + Paragraph)

**描述**：Basic text writing, including headings, body text, lists, and more.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `level` (Title) | 1 \| 2 \| 3 \| 4 \| 5 | 1 | T005 用 `level={2}` = `<h2>` |
| `type` | `secondary` \| `success` \| `warning` \| `danger` | — | T005 副标题用 `type="secondary"` |
| `strong` | boolean | false | 加粗 |
| `copyable` | boolean | false | 复制按钮（本特性不用） |
| `editable` | boolean | false | 可编辑（本特性不用） |

---

## design.md Token 速查（验证用）

来自 `antd design.md --format json`：

| Token | 值 | 本特性用法 |
|-------|-----|-----------|
| `colors.primary` | `#1677FF` | ConfigProvider theme.token.colorPrimary |
| `colors.success` | `#52C41A` | （本特性不用） |
| `colors.warning` | `#FAAD14` | （本特性不用） |
| `colors.error` | `#FF4D4F` | Alert type=error 自动用 |
| `colors.surface` (bg-container) | `#FFFFFF` | ConfigProvider theme.token.colorBgContainer |
| `colors.surface-layout` | `#F5F5F5` | ConfigProvider theme.token.colorBgLayout |
| `typography.body-md.fontSize` | `14px` | ConfigProvider theme.token.fontSize |
| `rounded.DEFAULT` | `6px` | ConfigProvider theme.token.borderRadius |
| `spacing.lg` | `24px` | useToken().paddingLG |
| `motion.motionDurationMid` | `0.2s` | antd 内置默认 |

---

## 复核（implementation 时）

每个组件的完整 API 用以下命令现场查（宪法 v2.1.0 强制）：

```bash
antd info <Component> --format json --version 6.x
antd doc <Component> --lang zh           # 完整中文文档
antd demo <Component> basic --format json  # 可运行 demo
antd semantic <Component> --format json  # classNames 结构（自定义样式时用）
antd token <Component> --format json     # 组件级 token
antd lint apps/web/src/routes/login.tsx --format json  # 写完后跑
```
