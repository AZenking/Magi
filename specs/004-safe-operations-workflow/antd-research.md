# antd v6 研究产物：安全运营工作流

**来源任务**: T001
**生成时间**: 2026-07-27
**宪法依据**: `.specify/memory/constitution.md` v2.2.0 ——「antd 视觉语言遵循（强制）」+「antd UI 编写流程（强制）」
**查询方式**: `antd design.md --format json` 与 `antd info <Component> --format json --version 6.x`、`antd demo <Component> basic --format json`

本特性所有 UI 任务（T034/T045–T047/T053/T059–T061/T065/T071–T074/T079/T086–T090/T096/T106–T108/T113/T121–T124/T132/T133）开始前必须先读本文件，完成后必须运行 T133 的 `antd lint`。

---

## 第一部分：视觉语言硬约束（design.md 摘录）

以下为 antd v6 默认 Light 主题的视觉契约，源自 `antd design.md`。任何视觉冲突按「四大价值观」裁决；token 之外的取值视为违规。

### 1. 四大价值观（Natural / Certain / Meaningful / Growing）

- **Natural（自然）**：沿用既有约定，不发明让回访用户意外的模式；优先 OS 与上一代企业软件的既有模式。
- **Certain（确定）**：用户始终知道当前状态、输入结果与下一步；hover/focus/loading/error 状态显式且一致。
- **Meaningful（有意义）**：视觉强调只留给动作；不传达信息的装饰一律移除。
- **Growing（可生长）**：从小表单到密集表格到多租户管理台都不失一致性。

**裁决规则**：两种方案冲突时，选让用户状态更确定、更可读的那一种。

### 2. 颜色（禁止硬编码 `#FFFFFF` / `#FAFAFA`）

| 用途 | token / 值 |
|------|------------|
| 主色（primary seed） | `#1677FF` |
| 语义色 | success `#52C41A` / warning `#FAAD14` / error `#FF4D4F` / info `#1677FF` |
| 主色 hover / active | hover `#4096FF` / active `#0958D9` |
| 选中项背景（menu/tabs 等） | `#E6F4FF` |
| 中性文字（rgba 形式优先） | 0.88 `#1F1F1F`（主文字）/ 0.65 `#595959`（次文字）/ 0.45（描述）/ 0.25 `#BFBFBF`（占位/禁用） |
| 三层 surface | `bg-layout` `#F5F5F5` / `bg-container` `#FFFFFF` / `bg-elevated` `#FFFFFF`（用阴影区分） |
| Tooltip 反相表面 | `rgba(0,0,0,0.85)` + 白字 |

**硬规则**：
- 产品代码中**禁止**硬编码 `#FFFFFF` 或 `#FAFAFA`，必须读 `colors.surface` / `colors.surface-container` / `colors.surface-layout`。
- preset 色板（`blue`~`lime`）**只用于 tag / chart / 分类可视化**，不得用于主 UI affordance 或主操作。
- 状态用功能色（success/warning/error/info），主操作用 `primary`，每屏只有一个 primary。
- 中性文字优先 `rgba(0,0,0,α)` 四档；hex 仅用于静态导出。

### 3. 排版（基础 14px，仅 400 / 600 两档字重）

| 角色 | 字号 / 字重 / 行高 |
|------|---------------------|
| body-md（默认正文/控件/菜单/标签） | 14px / 400 / 22px |
| title-md（标题、表头） | 14px / 600 / 22px |
| title-lg | 16px / 600 / 24px |
| body-lg | 16px / 400 / 24px |
| body-sm（tag） | 12px / 400 / 20px |
| code | 13px / 400 / 20px，等宽字体栈 |

**硬规则**：
- 基础字号 **14px**（不是 16），为密集 console 让位。
- 字重只用 **400（正文）/ 600（标题/表头）**；**禁用** thin(100–300)、bold(700+)、italic（长文档除外）。
- 选中/激活态靠**颜色与描边**强调，不靠字重。
- 字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`。

### 4. 4px 网格（spacing 仅允许 6 档）

| token | 值 |
|-------|----|
| unit / xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| control-height | 32px |

**硬规则**：所有 gap / gutter / inset 必须落在这 6 档；**禁止 magic number**（`padding: 11px`、`gap: 13px`）。

> 历史例外：input 的 `padding: 4px 11px` 早于 4px 网格，不允许据此引入新的非档值。

### 5. 圆角（默认 6px，按组件类别分档）

| 组件类别 | 圆角 token / 值 |
|----------|------------------|
| Controls（button / input / select / dropdown trigger） | `rounded.DEFAULT` 6px |
| Surfaces（card / modal / drawer / notification） | `rounded.lg` 8px |
| Tags / chips | `rounded.md` 4px |
| Tooltip / popover | `rounded.md` 4px |
| Tables / segmented 内边 | `rounded.none` 0px |
| Avatar / badge dot | `rounded.full` 9999px |

**硬规则**：
- `rounded.full`（9999px）**只用于** avatar / badge / dot，**不得用于** button / tag。
- 相邻元素圆角必须协调（8px 卡片内不应放 16px 圆角按钮）。

### 6. 动效（3 档时长 + 预定义 easing）

| token | 时长 | 用途 |
|-------|------|------|
| `motionDurationFast` | 0.1s | 状态变化（hover / focus / press） |
| `motionDurationMid` | 0.2s | 组件内过渡（折叠 / 淡入）；找不到更具体 token 时默认用它 |
| `motionDurationSlow` | 0.3s | 表面级变化（modal 进入 / drawer 滑入） |

**硬规则**：easing **只能**用预定义 token（`motionEaseInOut` / `motionEaseOut` / `motionEaseIn` / `motionEaseOutBack` / `motionEaseOutCirc` …）；**禁止自定义 `cubic-bezier`**。无匹配项时用 `motionEaseInOut`。

### 7. 高程（flat-first，阴影只给真正浮起的表面）

- **Tertiary**：轻量浮起（`boxShadowTertiary`）。
- **Popup**：标准浮层（`boxShadow` / `boxShadowSecondary`）—— modal、dropdown、popover。
- **Card**：卡片专属（`boxShadowCard`）。
- Modal mask 用 `rgba(0,0,0,0.45)`。
- 边框与色阶承担主要层级，不要为强调而堆阴影。

### 8. Do's & Don'ts（实施红线）

- ✅ 用四大价值观做平局裁判。
- ✅ surface 读 token（`colors.surface*`）。
- ✅ 不确定用 `motionDurationMid`。
- ✅ preset 色板只给 tag / chart / 分类。
- ✅ 所有间距走 4px 网格。
- ❌ 同一表面放两个 `primary` 按钮（选一个，其余降级 `default`）。
- ❌ 硬编码 `#FFFFFF` / `#FAFAFA`。
- ❌ 自定义 `cubic-bezier`。
- ❌ 在 preset 色板外造一次性强调色。
- ❌ magic number spacing。

### 9. 主题定制边界（T045/T087 等涉及 ConfigProvider 时遵守）

需要换主色、圆角、字号时，**只通过** `ConfigProvider.theme`：
1. `theme.token` 改 seed（`colorPrimary` / `colorSuccess` … / `borderRadius` / `fontSize` / `fontFamily`）。
2. `theme.algorithm` 切换推导逻辑（`defaultAlgorithm` / `darkAlgorithm` / `compactAlgorithm`），不要手动反转颜色。
3. `theme.components.<C>` 做组件级覆盖。
4. 静态 API（`message.xxx` / `Modal.xxx` / `notification.xxx`）需 hook 版或 `App` 包裹才拿得到上下文主题。
5. **禁止**生成绕过 token / algorithm / `theme.components` / CSS variables / 抽取静态样式的自定义 CSS —— 做不到就当设计系统扩展处理，不要写一次性页面样式。

---

## 第二部分：本特性采用的组件 v6 API 摘要

> 以下 props 表来自 `antd info <Component> --version 6.x`，仅列出本特性高频用到的项；完整列表以查询结果为准。`since` 字段为空表示 v6 可用。

### Table（`<div>`，高频：操作预览明细、频道列表、任务列表、审计列表）

A table displays rows of data.

| Prop | Type | Default |
|------|------|---------|
| `bordered` | boolean | false |
| `classNames` | Record<SemanticDOM, string> | - |
| `columns` | ColumnsType[] | - |
| `components` | 自定义渲染组件 | - |
| `dataSource` | object[] | - |
| `expandable` | expandable config | - |
| `footer` | (currentPageData) => ReactNode | - |
| `loading` | boolean \| SpinProps | false |
| `pagination` | object \| false | - |
| `rowClassName` | (record, index) => string | - |
| `rowKey` | string \| (record) => string | `key` |
| `rowSelection` | object | - |
| `scroll` | { x?, y? } | - |
| `size` | `default` \| `middle` \| `small` | `default` |
| `sticky` | boolean \| StickyProps | false |
| `summary` | (data) => ReactNode | - |
| `onChange` | (pagination, filters, sorter, extra) => void | - |

**本特性用法要点**（T045 operation-impact-table、T060 columns、T089 task list）：
- 用 `rowKey` 绑定**稳定 ID**（FR-015）：`rowKey={(r) => r.stableId}`，不要用数组索引。
- 跨分页选择用 `rowSelection.preserveSelectedRowKeys: true`（T053 失败测试要求）。
- 行级 loading 用 `rowClassName` + 任务 badge（FR-027），不要用单一 mutation flag。
- 表头字号走 token（title-md 14/600），不要 inline `fontSize`。
- 基本结构来自 `antd demo Table basic`（`TableProps<T>['columns']` + `dataSource`）。

### Modal（`<div>`，高频：影响确认、高风险确认、删除接替预览）

Display a modal dialog box, providing a title, content area, and action buttons.

| Prop | Type | Default |
|------|------|---------|
| `afterClose` | function | - |
| `cancelButtonProps` | ButtonProps | - |
| `cancelText` | ReactNode | `Cancel` |
| `centered` | boolean | false |
| `classNames` | Record<SemanticDOM, string> | - |
| `closable` | boolean | true |
| `confirmLoading` | boolean | false |
| `destroyOnClose` | boolean | false |
| `footer` | ReactNode \| null | 默认 OK/Cancel |
| `forceRender` | boolean | false |
| `keyboard` | boolean | true |
| `mask` | boolean | true |
| `maskClosable` | boolean | true |
| `modalRender` | (node) => ReactNode | - |
| `okButtonProps` | ButtonProps | - |
| `okText` | ReactNode | `OK` |
| `okType` | ButtonProps['type'] | `primary` |
| `open` | boolean | - |
| `title` | ReactNode | - |
| `width` | string \| number | 520 |
| `onCancel` | (e) => void | - |
| `onOk` | (e) => void | - |

**本特性用法要点**（T045 controlled confirmation、T061 purge preview、T108 source delete）：
- 高风险确认（purge / source delete）：`maskClosable={false}` + `keyboard={false}`，并要求**输入式**确认（FR-016），不要让 Esc 关闭。
- **每屏一个 primary**：主操作 `okType="primary"`，次操作用 default；不要两个都 primary。
- 圆角 8px（`rounded.lg`），body padding 20×24，**不要**自定义。
- 上下文 Modal（`Modal.useModal()`）拿 token；静态 `Modal.confirm` 不自动继承主题，主题场景用 hook 版。

### Form（`<form>`，高频：调度编辑、来源策略、故障转移策略）

| Prop | Type | Default |
|------|------|---------|
| `colon` | boolean | true |
| `disabled` | boolean | false |
| `fields` | { name, value }[] | - |
| `form` | FormInstance | - |
| `initialValues` | object | - |
| `labelAlign` | `left` \| `right` | `right` |
| `labelCol` | ColProps | - |
| `labelWrap` | boolean | false |
| `layout` | `horizontal` \| `vertical` \| `inline` | `horizontal` |
| `name` | string | - |
| `preserve` | boolean | true |
| `requiredMark` | boolean \| 'optional' | true |
| `validateMessages` | object | - |
| `validateTrigger` | string \| string[] | `onChange` |
| `wrapperCol` | ColProps | - |
| `onFinish` | (values) => void | - |
| `onFinishFailed` | (errorInfo) => void | - |
| `onValuesChange` | (changed, all) => void | - |

**本特性用法要点**（T087 schedule Save/Cancel 草稿、T119 source policy、T121 failover policy）：
- 调度编辑用受控草稿：`form.setFieldsValue(serverResource)`，**Cancel 不发请求**并 `form.resetFields()`（FR-022、SC-006）。
- **Save 发送完整校验草稿**，字段级 onChange 不触发请求。
- 控件高度 32px，label 用 title-md，间距 16/24。
- `Form.Item` 的 `rules` + `validateMessages` 实现 FR-016 的 typed acknowledgement。

### Steps（`<div>`，高频：操作 preview → confirm → apply 流程、恢复预检）

| Prop | Type | Default |
|------|------|---------|
| `current` | number | 0 |
| `direction` | `horizontal` \| `vertical` | `horizontal` |
| `initial` | number | 0 |
| `labelPlacement` | `horizontal` \| `vertical` | `horizontal` |
| `percent` | number | - |
| `size` | `default` \| `small` | `default` |
| `status` | `wait` \| `process` \| `finish` \| `error` | `process` |
| `type` | `default` \| `navigation` \| `inline` | `default` |
| `onChange` | (current) => void | - |

**本特性用法要点**（T045 preview 流程、T102 backup restore `validating → checkpointing → applying → verifying`）：
- 恢复 4 阶段（contracts/backups.md）直接映射 `items` + `current`。
- `status="error"` 标记失败阶段；`percent` 来自任务 progress（FR-037）。
- 间距走 16/24，标题 600。

### Tabs（`<div>`，高频：频道生命周期 active/hidden/disabled/trashed 视图、匹配工作台四类）

| Prop | Type | Default |
|------|------|---------|
| `activeKey` | string | - |
| `addIcon` | ReactNode | - |
| `animated` | boolean \| { inkBar, tabPane } | - |
| `centered` | boolean | false |
| `items` | Tab[] | - |
| `popupClassName` | string | - |
| `size` | `large` \| `middle` \| `small` | `middle` |
| `tabBarExtraContent` | ReactNode \| { left, right } | - |
| `tabBarGutter` | number | - |
| `tabBarStyle` | CSSProperties | - |
| `tabPosition` | `left` \| `right` \| `top` \| `bottom` | `top` |
| `type` | `line` \| `card` \| `editable-card` | `line` |
| `onChange` | (key) => void | - |
| `onEdit` | (key, action) => void | - |

**本特性用法要点**（T059 lifecycle tabs、T072 EPG workbench 四类）：
- 用 `items` API（v6，不要再用旧 `TabPane` 子组件）。
- 激活 tab：primary 文字 + 2px primary 下划线，**无背景填充**（design.md 明示）。
- tab 数量计数（FR-012、quickstart Scenario 1/7）放在 `label` 内，例：`label: <span>冲突 (300)</span>`。

### Badge（`<span>`，高频：运行中/失败任务、线路状态、行级任务徽章）

| Prop | Type | Default |
|------|------|---------|
| `color` | string | - |
| `count` | ReactNode | - |
| `offset` | [number, number] | - |
| `overflowCount` | number | 99 |
| `showZero` | boolean | false |
| `size` | `default` \| `small` | `default` |
| `status` | `success` \| `processing` \| `default` \| `error` \| `warning` | - |
| `title` | string | - |

**本特性用法要点**（T090 全局任务状态、T059 行 badge）：
- 关键状态用 `status` + 功能色（`processing`=primary、`error`=error）。
- 状态点（dot）用 `status` 且 6×6 + `rounded.full`；dot **不替代**无障碍关键文字。
- 每行/每任务徽章按 taskId/target key（FR-027），不要共享一个 flag。

### Alert（`<div>`，高频：影响预览 warnings/blockers、空状态、恢复阻断）

| Prop | Type | Default |
|------|------|---------|
| `action` | ReactNode | - |
| `banner` | boolean | false |
| `closable` | boolean | false |
| `description` | ReactNode | - |
| `message` | ReactNode | - |
| `showIcon` | boolean | true（有 type 时） |
| `type` | `success` \| `info` \| `warning` \| `error` | `info`（默认，依实际查询） |

**本特性用法要点**（T045 warnings/blockers、FR-009 readiness blocker）：
- warnings/blockers 用 `type="warning"` / `type="error"`，语义背景（`#FFFBE6` / `#FFF2F0`）+ 正常文字色，**不要**用低对比彩色正文。
- `action` 放修复入口（FR-029 actionUrl、quickstart Scenario 13）。
- `description` 解释稳定 code 含义，前端按 `code` 分支，不解析 `detail`（contracts/common.md）。

### Drawer（`<div>`，高频：任务详情、匹配候选详情、审计详情）

| Prop | Type | Default |
|------|------|---------|
| `afterOpenChange` | (open) => void | - |
| `closable` | boolean | true |
| `destroyOnClose` | boolean | false |
| `extra` | ReactNode | - |
| `forceRender` | boolean | false |
| `height` | string \| number | 378（top/bottom） |
| `keyboard` | boolean | true |
| `mask` | boolean | true |
| `maskClosable` | boolean | true |
| `placement` | `top` \| `right` \| `bottom` \| `left` | `right` |
| `push` | boolean \| object | true |
| `size` | `default` \| `large` | `default` |
| `title` | ReactNode | - |
| `width` | string \| number | 378 |
| `open` | boolean | - |
| `onClose` | (e) => void | - |

**本特性用法要点**（T088 task detail、T071 candidate detail、T107 audit detail）：
- surface 圆角 8px，使用 popup 阴影。
- 详情类用 `placement="right"` + `size="large"`（信息密度）。
- 关闭用 `onClose` + `maskClosable`，但高风险操作进行中不要让 mask 关闭打断。

### Progress（`<div>`，高频：任务粗粒度进度、长任务里程碑）

| Prop | Type | Default |
|------|------|---------|
| `gapDegree` | number | 75（circle/dashboard） |
| `gapPosition` | `top` \| `right` \| `bottom` \| `left` | - |
| `percent` | number | 0 |
| `showInfo` | boolean | true |
| `size` | number \| [number, number] \| 'small' \| 'default' | `default` |
| `status` | `success` \| `exception` \| `normal` \| `active` | - |
| `strokeColor` | string \| object | - |
| `strokeWidth` | number | 10（line）/ 6（circle） |
| `steps` | number \| object | - |
| `trailColor` | string | - |
| `type` | `line` \| `circle` \| `dashboard` | `line` |

**本特性用法要点**（T088 task progress、FR-037 粗粒度进度）：
- `percent` 来自任务 `progress.percent`（contracts/tasks.md）。
- 失败用 `status="exception"`，运行中 `status="active"`，颜色走 token（不要 inline `strokeColor="#FF4D4F"`，用语义）。
- 粗粒度（每 10% 或每 1000 行）打点，不逐行（宪法 VII）。

---

## 第三部分：API 调用查询产物索引（T133 与后续任务复用）

完整原始产物保留在执行环境 `/tmp/antd-research/`，本特性任务可在执行前重新运行同一命令取最新值：

```bash
antd design.md --format json
antd info <Component> --format json --version 6.x   # Component ∈ 上述 9 个
antd demo <Component> basic --format json
```

需要 `classNames` 结构时：`antd semantic <Component>`；需要 token 时：`antd token <Component>`；版本迁移提示：`antd migrate 5 6 --apply ./src`。

完成 UI 后必须运行（T133）：

```bash
antd lint apps/web/src --format json
```

---

## 第四部分：本特性 UI 实施清单（自检）

每个 UI 任务提交前对照：

- [ ] 颜色无硬编码 `#FFFFFF` / `#FAFAFA` / 一次性强调色；功能色与 primary 各司其职。
- [ ] 字号 14px 起、字重仅 400 / 600；间距落在 4 / 8 / 16 / 24 / 32。
- [ ] 圆角按组件类别（controls 6 / surfaces 8 / tags·tooltip 4 / avatar·badge·dot 9999）。
- [ ] 动效用预定义 token，无自定义 `cubic-bezier`。
- [ ] 每屏仅一个 primary button；preset 色板只用于 tag / chart。
- [ ] 受影响行的 loading/禁用绑定 taskId/target，不用共享 flag。
- [ ] 批量选择与确认使用稳定 ID + 名称（FR-015），不依赖行号。
- [ ] 任何主题定制走 `ConfigProvider.theme`（token / algorithm / components），不写绕过 token 的自定义 CSS。
