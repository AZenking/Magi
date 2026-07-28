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

---

# 扩展组件（002 特性增量，T001 追加）

以下组件在本特性新增使用。每个含描述 + 关键 props（不全量 dump）。完整 API 用 `antd info <Component> --version 6.x` 现场查。

## Layout（含 Sider / Header / Content / Footer）

**描述**：Handling the overall layout of a page.

| 组件 / Prop | Type | Default | 用途 |
|------------|------|---------|------|
| `<Layout>` | — | — | 顶层布局容器；子元素水平或垂直排列 |
| `<Layout.Sider>` | — | — | 侧边栏；含 breakpoint / collapsed / collapsible / trigger / width |
| ↳ `width` | number \| string | 200 | 侧边栏宽度 |
| ↳ `breakpoint` | `xs` \| `sm` \| `md` \| `lg` \| `xl` \| `xxl` | — | 触发折叠的断点 |
| ↳ `collapsed` | boolean | — | controlled 折叠状态 |
| ↳ `collapsible` | boolean | false | 是否可折叠 |
| ↳ `trigger` | ReactNode | 默认折叠按钮 | 自定义折叠触发器；传 null 隐藏 |
| `<Layout.Header>` | — | — | 顶部栏；默认 64px 高、colorBgContainer 背景 |
| `<Layout.Content>` | — | — | 主内容区 |

## Menu

**描述**：A versatile menu for navigation.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | ItemType[] | — | 菜单项数组（含 key / label / icon / children / type=group|divider） |
| `mode` | `vertical` \| `horizontal` \| `inline` | `vertical` | 渲染模式 |
| `selectedKeys` | string[] | — | controlled 选中项 |
| `openKeys` | string[] | — | controlled 展开项（仅 inline / vertical） |
| `onClick` | ({ key, keyPath, item, domEvent }) => void | — | 点击回调 |
| `theme` | `light` \| `dark` | `light` | Sider 内暗色菜单时用 dark |

## Breadcrumb

**描述**：Display the current location within a hierarchy.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | ItemType[] | — | 面包屑项数组（含 title / href / onClick） |
| `separator` | ReactNode | `/` | 分隔符 |
| `onClick` | (e) => void | — | 点击回调 |

## Dropdown

**描述**：A dropdown list.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `menu` | `{ items, onClick, selectedKeys, ... }` | — | 菜单配置（替代旧 overlay + Menu 写法） |
| `trigger` | `click` \| `hover` \| `contextMenu`（数组） | `['hover']` | 触发方式 |
| `placement` | `topLeft` / `top` / `bottomRight` 等 | `bottomLeft` | 弹出位置 |
| `open` | boolean | — | controlled 展开状态 |

## Drawer

**描述**：A panel that slides out from the edge of the screen.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `open` | boolean | — | controlled 展开（v6 用 open，旧版 visible 已弃用） |
| `placement` | `top` \| `right` \| `bottom` \| `left` | `right` | 滑出方向 |
| `title` | ReactNode | — | 标题 |
| `footer` | ReactNode | — | 底部内容 |
| `closable` | boolean \| ClosableType | true | 关闭按钮 |
| `mask` | boolean \| { enabled, blur } | true | 遮罩 |
| `size` | `default` \| `large` \| number | `default` | 尺寸 |
| `loading` | boolean | false | 加载状态 |
| `destroyOnClose` | boolean | false | 关闭时销毁子组件 |

## Modal

**描述**：Display a modal dialog box.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `open` | boolean | — | controlled 展开（v6 用 open） |
| `title` | ReactNode | — | 标题 |
| `footer` | ReactNode \| (originNode, extra) => ReactNode | 默认 OK/Cancel | 底部；传 null 隐藏 |
| `okText` / `cancelText` | ReactNode | `OK` / `Cancel` | 按钮文案 |
| `okButtonProps` / `cancelButtonProps` | object | — | 按钮 props（danger / loading / disabled） |
| `closable` | boolean \| ClosableType | false | 关闭按钮 |
| `mask` | boolean \| { enabled, blur } | true | 遮罩 |
| `loading` | boolean | — | 确认按钮 loading |
| `destroyOnClose` | boolean | false | 关闭时销毁 |
| `width` | number \| string | 520 | 宽度 |

**Modal 静态方法**（`Modal.warning` / `Modal.confirm` 等）：v6 推荐 `const [modal, contextHolder] = Modal.useModal()` 然后 `modal.confirm({...})` —— 这样能拿到 ConfigProvider 主题。`App.useApp()` 也提供 modal hook。

## Collapse

**描述**：A content area which can be collapsed and expanded.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | ItemType[] | — | 折叠项数组（含 key / label / children / forceRender） |
| `activeKey` | string \| string[] | — | controlled 展开项 |
| `accordion` | boolean | false | 手风琴模式 |
| `bordered` | boolean | true | 边框 |
| `size` | `large` \| `middle` \| `small` | `middle` | 尺寸 |

## Divider

**描述**：A divider line separates different content.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `type` | `horizontal` \| `vertical` | `horizontal` | 方向 |
| `variant` | `dashed` \| `dotted` \| `solid` | `solid` | 线型 |
| `orientation` | `left` \| `right` \| `center` | `center` | 带文字时的对齐 |

## Skeleton

**描述**：Provide a placeholder while you wait for content to load.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `loading` | boolean | — | 是否显示骨架 |
| `active` | boolean | false | 动画 |
| `avatar` | boolean \| object | false | 头像骨架 |
| `paragraph` | boolean \| object | true | 段落骨架 |
| `title` | boolean \| object | true | 标题骨架 |

## Switch

**描述**：Used to toggle between two states.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `checked` | boolean | — | controlled 状态 |
| `defaultChecked` | boolean | false | 默认状态 |
| `disabled` | boolean | false | 禁用 |
| `loading` | boolean | false | 加载 |
| `size` | `default` \| `small` | `default` | 尺寸 |
| `onChange` | (checked, event) => void | — | 切换回调 |

## Segmented

**描述**：Display multiple options and allow users to select a single option.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `options` | (string \| number \| SegmentedRawItem \| SegmentedLabeledOption)[] | — | 选项数组 |
| `value` | string \| number | — | controlled 选中 |
| `block` | boolean | false | 占满父宽 |
| `size` | `large` \| `middle` \| `small` | `middle` | 尺寸 |
| `onChange` | (value) => void | — | 切换回调 |

## Pagination

**描述**：A long list can be divided into several pages.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `current` | number | — | controlled 当前页 |
| `pageSize` | number | — | controlled 每页大小 |
| `total` | number | — | 总条数 |
| `showSizeChanger` | boolean | — | 显示每页大小选择器 |
| `pageSizeOptions` | string[] | `['10', '20', '50', '100']` | 每页大小选项 |
| `showTotal` | (total) => ReactNode | — | 总数显示函数 |
| `onChange` | (page, pageSize) => void | — | 翻页回调 |

## Avatar

**描述**：Used to represent users or things.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `src` | string | — | 图片 URL |
| `icon` | ReactNode | — | 图标（无 src 时） |
| `size` | number \| `large` \| `small` \| `default` \| responsive | `default` | 尺寸 |
| `shape` | `circle` \| `square` | `circle` | 形状 |

## Card

**描述**：A container for displaying information.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `title` | ReactNode | — | 标题 |
| `extra` | ReactNode | — | 右上角额外内容 |
| `bordered` | boolean | true | 边框 |
| `variant` | `outlined` \| `borderless` | `outlined` | 视觉风格 |
| `loading` | boolean | false | 加载骨架 |
| `size` | `default` \| `small` | `default` | 尺寸 |
| `hoverable` | boolean | false | hover 抬升 |
| `cover` | ReactNode | — | 顶部封面 |

## Tabs

**描述**：Tabs make it easy to explore and switch between different views.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | TabItemType[] | [] | 标签项数组（含 key / label / children / disabled / forceRender） |
| `activeKey` | string | — | controlled 选中 |
| `tabPosition` | `top` \| `bottom` \| `left` \| `right` | `top` | 位置 |
| `type` | `line` \| `card` \| `editable-card` | `line` | 视觉风格 |
| `size` | `large` \| `middle` \| `small` | `middle` | 尺寸 |
| `onChange` | (key) => void | — | 切换回调 |
| `destroyInactiveTabPane` | boolean | false | 切换时销毁未激活面板 |

## Checkbox

**描述**：Collect user's choices.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `checked` | boolean | — | controlled 状态 |
| `indeterminate` | boolean | false | 半选状态 |
| `disabled` | boolean | false | 禁用 |
| `onChange` | (e) => void | — | 切换回调 |
| `<Checkbox.Group>` | — | — | 多选组；options / value / onChange |

## Spin

**描述**：Used for the loading status of a page or a block.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `size` | `small` \| `default` \| `large` | `default` | 尺寸 |
| `spinning` | boolean | true | 是否旋转 |
| `tip` | ReactNode | — | 提示文案 |
| `delay` | number | — | 延迟显示（ms） |

## Progress

**描述**：Display the current progress of the operation.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `percent` | number | 0 | 进度百分比 |
| `status` | `success` \| `exception` \| `active` \| `normal` | `normal` | 状态 |
| `type` | `line` \| `circle` \| `dashboard` | `line` | 类型 |
| `showInfo` | boolean | true | 显示百分比文字 |
| `strokeColor` | string \| object | — | 进度条颜色 |

## Tag

**描述**：Used for marking and categorization.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `color` | string（preset 色: blue/green/red/... 或 hex） | `default` | 颜色 |
| `variant` | `filled` \| `solid` \| `outlined` | `filled` | 视觉风格 |
| `closable` | boolean | false | 可关闭 |
| `bordered` | boolean | true | 边框 |
| `onClose` | (e) => void | — | 关闭回调 |

## Descriptions

**描述**：Display multiple read-only fields in a group.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | DescriptionsItem[] | — | 字段数组（含 key / label / children / span） |
| `title` | ReactNode | — | 标题 |
| `bordered` | boolean | false | 边框（表格形式） |
| `column` | number \| object | 3 | 列数 |
| `size` | `default` \| `middle` \| `small` | `default` | 尺寸 |

## Timeline

**描述**：Vertical display timeline.

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `items` | Items[] | — | 时间轴项数组（含 color / dot / label / children） |
| `mode` | `left` \| `right` \| `alternate` | — | 模式 |

## Grid（Row / Col）

**Row**：

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `gutter` | number \| [number, number] \| object | 0 | 列间距（水平 / 垂直 / 响应式） |
| `align` | `top` \| `middle` \| `bottom` | `top` | 垂直对齐 |
| `justify` | `start` \| `end` \| `center` \| `space-around` \| `space-between` \| `space-evenly` | `start` | 水平对齐 |
| `wrap` | boolean | true | 是否换行 |

**Col**：

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `span` | number | — | 占 24 列中的几列 |
| `offset` | number | 0 | 左侧偏移 |
| `flex` | string \| number | — | flex 布局（替代 span） |
| `xs` / `sm` / `md` / `lg` / `xl` / `xxl` | number | — | 响应式断点 span |

## Form.Item（补充 001 未单独查）

| Prop | Type | 用途 |
|------|------|------|
| `name` | string \| string[] | 字段名（同时是 onFinish values 的 key） |
| `label` | ReactNode | 标签（自动渲染 `<label for>`） |
| `rules` | Rule[] | 校验规则；如 `{ required: true, message: "..." }` / `{ pattern: /.../, message: "..." }` / `{ validator: (rule, value) => Promise }` |
| `valuePropName` | string | 值 prop 名（如 Switch 用 "checked"） |
| `help` | ReactNode | 自定义帮助文本 |
| `validateStatus` | `success` \| `warning` \| `error` \| `validating` | 强制校验状态 |
| `hasFeedback` | boolean | 显示校验图标 |
| `initialValue` | any | 初始值 |
| `dependencies` | string[] | 依赖字段（联动校验用） |

## Input.TextArea（补充 001 未单独查）

`Input.TextArea` 是 Input 子组件，主要 props：

| Prop | Type | Default | 用途 |
|------|------|---------|------|
| `rows` | number | — | 固定行数 |
| `autoSize` | boolean \| { minRows, maxRows } | false | 自适应高度 |
| `showCount` | boolean | false | 显示字符计数 |
| `maxLength` | number | — | 最大长度 |

所有 Input 原生 props（value / onChange / placeholder / disabled 等）都支持。
