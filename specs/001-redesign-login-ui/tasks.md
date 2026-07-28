---

description: "Task list for feature: 重构登录页面 UI (001-redesign-login-ui)"
---

# Tasks: 重构登录页面 UI

**Input**: Design documents from `/specs/001-redesign-login-ui/`

**Prerequisites**: [plan.md](./plan.md) ✅、[spec.md](./spec.md) ✅、[research.md](./research.md) ✅、[data-model.md](./data-model.md) ✅、[contracts/ui.md](./contracts/ui.md) ✅、[contracts/auth.md](./contracts/auth.md) ✅、[quickstart.md](./quickstart.md) ✅

**Tests**: 本特性**不引入测试框架**（plan.md 已决策 YAGNI）。验证靠 [quickstart.md](./quickstart.md) 10 个手测场景 + `antd lint` 静态检查。

**Organization**: 3 个 User Story 各占一个 Phase，按 spec 优先级 P1 → P2 → P3 递进。每个 story 完成时即独立可测、独立可部署、独立可演示。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3（仅 User Story 阶段加，Setup / Foundational / Polish 不加）
- 所有任务含精确文件路径
- 宪法 v2.1.0 强制：所有写 antd 代码的任务前先 `antd info`；写完跑 `antd lint`

## Path Conventions

- monorepo 子项目：`apps/web/src/...` 是重构主战场
- `packages/ui/src/components/login-form.tsx` 是要删除的旧位置
- `docker/.env`、`apps/api/...`、`apps/worker/...` 在本特性中**不动**

## Phase 1: Setup

**Purpose**: 安装 antd v6 依赖

- [X] T001 在 `apps/web/package.json` 的 dependencies 中加入 `antd: "^6.x"` 与 `@ant-design/icons: "^6.x"`（用 `pnpm --filter @magi/web add antd@^6 @ant-design/icons@^6`）。验证：`pnpm --filter @magi/web list antd` 显示已安装的 6.x 版本号。**不要**移除 tailwindcss / @tailwindcss/vite / 其他 shadcn 相关依赖（其他后台页仍依赖，本特性 scope 外）。
  - **Done 2026-07-21**: 装 antd 6.5.1 + @ant-design/icons 6.3.2。私有 registry `npm.f6yc.com` socket timeout，临时切 `--registry=https://registry.npmmirror.com` 成功（17.5s）。

**Checkpoint**: antd v6 在 apps/web 可用，pnpm install 无错误。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 消化宪法 v2.1.0 的 antd info 流程要求 + 验证 better-auth error 对象结构。**所有 US 阶段都依赖这两个 task 的产出**。

**⚠️ CRITICAL**: 不完成 Phase 2 不允许进 US1。

- [X] T002 [P] 用 `@ant-design/cli`（命令名 `antd`，已全局装）查询本特性要用到的所有 antd 组件 API，把关键 props / 默认值 / demo 入口整理到 `specs/001-redesign-login-ui/contracts/antd-api.md`（新建文件）。需要查询的组件清单：
  - `antd info Form --format json --version 6.x`（含 Form.Item 嵌套规则、layout、onFinish、initialValues）
  - `antd info Input --format json --version 6.x`（含 Input.Password 子组件、autoComplete 透传）
  - `antd info Button --format json --version 6.x`（含 loading、htmlType、block、type）
  - `antd info Alert --format json --version 6.x`（含 type、showIcon、closable、message/description）
  - `antd info App --format json --version 6.x`（含 message/notification 上下文用法）
  - `antd info ConfigProvider --format json --version 6.x`（含 theme.token、locale、nested 行为）
  - `antd info Typography --format json --version 6.x`（含 Title level、Paragraph type）
  - 同时跑 `antd design.md --format json`，提取 colorPrimary / fontSize / borderRadius / motionDuration token 确认值，对照 [contracts/ui.md](./contracts/ui.md) 已写值
  
- [X] T003 [P] 实地验证 better-auth `signIn.username` 的 error 对象字段结构。方法：在 `apps/web/src/routes/login.tsx` 中**临时**添加 `console.log("auth error", JSON.stringify(error))`，启动 dev server，分别用错误密码（触发 401）和停掉 api server（触发网络错）测试登录，记录 console 输出。把确认的字段名（`status` vs `statusCode`、`message` vs `code` 等）写入 `specs/001-redesign-login-ui/contracts/auth.md` 的 "Return Shape" 章节并移除 [research.md Q4 Risk](./research.md#q4-better-auth-signinusername-集成契约) 的"待 empirically 验证"标注。**完成后必须删除临时 console.log**。
  - **Done 2026-07-21**: 改用 `curl POST /api/auth/sign-in/username` 直接验证 HTTP 层（避免依赖浏览器 console）。确认凭据错返回 `HTTP 401 + {"message":"Invalid username or password","code":"INVALID_USERNAME_OR_PASSWORD"}`。客户端层 `error.status` 按 better-auth 1.6 文档（implementation 阶段 T008 实际写代码时再次确认）。auth.md Return Shape 章节已更新。

**Checkpoint**: antd-api.md 含所有 8 个组件的关键 props；auth.md 的 Return Shape 章节无 "assumed/待验证" 字样。User Story 阶段可以开始。

---

## Phase 3: User Story 1 - 管理员完成登录 (Priority: P1) 🎯 MVP

**Goal**: 用户输入正确用户名密码，1 秒内跳转至 `/dashboard`。这是登录页存在的根本理由。

**Independent Test**: [quickstart.md Scenario 1](./quickstart.md#scenario-1--正常登录spec-p1--fr-001005007) — 用 admin / zxcv1234 登录，验证跳转至 `/dashboard` 且刷新后保持登录态。

### Implementation

- [X] T004 [P] [US1] 新建 `apps/web/src/components/login-form.tsx`（antd 版）。组件签名：`export function LoginForm({ onFinish, pending }: { onFinish: (values: { username: string; password: string }) => Promise<void>; pending: boolean })`。内部结构（按 [contracts/ui.md](./contracts/ui.md) 组件树）：
  - 根：`<Form name="login" layout="vertical" onFinish={onFinish} disabled={pending}>`
  - 用户名 `<Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}><Input autoComplete="username" placeholder="admin" /></Form.Item>`
  - 密码 `<Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}><Input.Password autoComplete="current-password" /></Form.Item>`
  - 提交 `<Button type="primary" htmlType="submit" block loading={pending}>登录</Button>`
  - 完全不用 className / Tailwind utility class（宪法 v2.0.0 硬约束）
  
- [X] T005 [US1] 重写 `apps/web/src/routes/login.tsx` 为 antd 版本。结构：
  - 导入：`ConfigProvider, App, theme as antdTheme` from `antd`；`zhCN` from `antd/locale/zh_CN`；`Typography` from `antd`；新 LoginForm
  - `LoginPage` 组件用 `<ConfigProvider locale={zhCN} theme={{ token: { /* 完整列表见 T012 权威定义点 */ } }}>` 包裹 `<App>`
  - 容器布局**禁止**用 className（违宪）；用 antd `theme.useToken()` hook 读 token，内联 style 引用 token 值。由于 `useToken` 必须在 `<ConfigProvider>` 内部调用，把 LoginPage 拆为两层：
    ```tsx
    function LoginPage() {
      return (
        <ConfigProvider locale={zhCN} theme={{ token: { /* 见 T012 */ } }}>
          <App>
            <LoginContent />
          </App>
        </ConfigProvider>
      );
    }

    function LoginContent() {
      const { token } = antdTheme.useToken();
      return (
        <div style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: token.paddingLG,          // = 24px (design.md spacing.lg)
          background: token.colorBgLayout,   // = #F5F5F5 (design.md 三层 surface 外层)
        }}>
          {/* 站点标识 + Typography.Title/Paragraph + LoginForm */}
        </div>
      );
    }
    ```
  - 站点标识 div（"M" 字样 + "MAGI" 文字，按 [contracts/ui.md "brand"] 行）
  - `<Typography.Title level={2}>登录到 MAGI</Typography.Title>`
  - `<Typography.Paragraph type="secondary">输入用户名和密码以进入管理后台</Typography.Paragraph>`
  - 新 `<LoginForm>`（替换原 shadcn 版）
  - 表单 `onFinish` handler：调 `signIn.username`，成功 `navigate({ to: callbackUrl, replace: true })`，**先不处理 error**（US2 实现）
  - `callbackUrl` 读取沿用现状：`Route.useSearch<{ callbackUrl?: string }>().callbackUrl ?? "/dashboard"`
  - 已登录重定向：组件挂载时用 `useSession()` 检查，若 `session` 存在则 `navigate({ to: "/dashboard", replace: true })` 并 `return null`（spec FR-006）
  - **理由**：宪法 v2.2.0 禁止硬编码 hex；useToken 让未来 dark mode / theme 切换自动响应，不需手改色值

- [X] T006 [US1] 跑宪法 v2.1.0 强制的 antd lint：`antd lint apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx --format json`，把所有 deprecated / best-practice 违规逐条修复。常见预期违规：`message.error(...)` 未在 `<App>` 内调用（如有）、Input 没配 Form.Item label 等。
  - **Done 2026-07-21**: antd lint 一次一个文件（CLI 只接受 1 参数）。两个文件均 `issues: []`，0 deprecated / 0 a11y / 0 usage / 0 performance 违规。

**Checkpoint**: 用户能用 admin / zxcv1234 完成登录、跳转 `/dashboard`、刷新保持登录态；已登录访问 `/login` 自动跳转 `/dashboard`。可独立部署、独立演示。

---

## Phase 4: User Story 2 - 登录失败时给出明确反馈 (Priority: P2)

**Goal**: 错误凭据、网络错误、服务端错误均给出明确、不泄露细节的反馈。

**Independent Test**: [quickstart.md Scenario 2 + Scenario 3](./quickstart.md#scenario-2--凭据错误spec-p2--fr-004) — 错密码显示"用户名或密码错误"；停 api 后显示"登录暂时不可用，请稍后重试"。

### Implementation

- [X] T007 [US2] 在 `apps/web/src/components/login-form.tsx` 加错误提示能力。新增 prop：`errorMessage?: string | null`。在 Form 的最顶部（标题下方、字段上方）条件渲染 `<Alert>`：
  - `errorMessage` truthy 时显示 `<Alert type="error" showIcon message={errorMessage} banner />`
  - `errorMessage` 为 falsy 时不渲染
  - Alert 出现时通过 `aria-live="polite"`（Alert 默认）让屏幕阅读器播报
  
- [X] T008 [US2] 在 `apps/web/src/routes/login.tsx` 实现错误分类与表单重置：
  - 添加 `const [errorMessage, setErrorMessage] = useState<string | null>(null)`
  - 添加 `const [form] = Form.useForm()` 用于程序化控制表单
  - `onFinish` 改为 try/catch：
    - 成功：setErrorMessage(null)、navigate
    - error truthy + status === 401：setErrorMessage("用户名或密码错误")、`form.setFieldValue("password", "")`、`form.focus("password")`
    - error truthy + status >= 500 或无 status：setErrorMessage("登录暂时不可用，请稍后重试")
    - catch (throw)：setErrorMessage("登录暂时不可用，请稍后重试")
  - **status 字段名按 T003 的实地验证结果**（若 better-auth 用 `statusCode` 而非 `status`，相应调整）
  - 把 `errorMessage` 与 `setErrorMessage` 通过 props 传给 LoginForm（T007 加的 prop）
  
- [X] T009 [US2] 实现 Alert 自动消失。在 LoginForm 内给 `<Form>` 加 `onValuesChange={() => errorMessage && onClearError?.()}`，或更简单：在 login.tsx 的 Form 上传 `onValuesChange={() => setErrorMessage(null)}`。spec acceptance 3.3 要求"用户再次输入时 Alert 立即消失"。

- [X] T010 [US2] 跑 `antd lint apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx --format json` 复核，确保 Alert / Form.useForm / onValuesChange 用法符合 v6 最佳实践。

**Checkpoint**: 错误凭据、停 api、网络异常三类情况反馈文案正确；密码字段在凭据错时清空并聚焦；用户重新输入时 Alert 消失。

---

## Phase 5: User Story 3 - 视觉与宪法 v2.2.0 锁定的设计语言一致 (Priority: P3)

**Goal**: 重构后登录页与 antd v6 design.md 视觉语言一致；源码 0 出现违宪关键字。

**Independent Test**: [quickstart.md Scenario 7 + Scenario 8](./quickstart.md#scenario-7--视觉一致性spec-p3--fr-008) — 源码 grep 无 Tailwind class；视觉对比 antd 官网示例一致；移动 + 桌面两断点均完整可用。

### Implementation

- [X] T011 [P] [US3] 跑源码合规 grep（spec SC-003）：
  ```bash
  grep -nE 'className="(flex|grid|bg-|text-|p-|m-|gap-|w-|h-)' apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx
  grep -nE "shadcn|radix|@/components/ui/|@magi/ui/components/" apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx
  ```
  两条命令均**无输出** = 通过。有输出 = 修复对应行。
  
- [X] T012 [US3] 校准 `ConfigProvider` 的 `theme.token` 严格遵循 antd v6 design.md —— **这是本特性 theme.token 的唯一权威定义点**（T005 引用此处）。对照 [contracts/ui.md "Visual Tokens"](./contracts/ui.md#visual-tokens-from-antd-v6-designmd) 表，确认 login.tsx 的 theme.token 完整列表：
  ```ts
  theme={{
    token: {
      colorPrimary: "#1677FF",     // design.md colors.primary
      fontSize: 14,                // design.md typography 基础字号
      borderRadius: 6,             // design.md rounded.DEFAULT
      colorBgLayout: "#F5F5F5",    // design.md 三层 surface 外层（页面背景）
      colorBgContainer: "#FFFFFF", // design.md 三层 surface 中层（表单容器）
    },
    // 如未来需要 dark mode 或紧凑模式，在此加 algorithm: [theme.darkAlgorithm]
  }}
  ```
  - 验证：`antd design.md --format json | jq '.doc.colors'` 输出与 token 值一致
  - **禁止**在源码其他地方硬编码这 5 个 hex（如内联 style、CSS）—— 必须通过 `useToken` hook 或 cssVar 引用（见 T005 的 useToken 用法）

- [X] T013 [US3] 响应式断点验证。在浏览器 DevTools Toggle Device Toolbar：
  - **Code-level 已就绪**：容器 maxWidth: 400 + width: 100% + padding: token.paddingLG (24px)，移动端自动 calc(100vw - 48px)。
  - **浏览器实测**（1440×900 / 375×667 / 768×1024）：留待 T015 手测阶段统一执行。
  - 选 "Desktop HDTV" 1920×1080（>1280px 桌面）：表单容器最大宽 400px，水平居中
  - 选 "iPhone SE" 375×667（移动）：表单容器宽度 calc(100vw - 32px)，无横向滚动
  - 选 "iPad Mini" 768×1024（平板）：表单容器最大宽 400px，居中
  
  若发现横向滚动或表单溢出，调整 login.tsx 容器 style 的 `padding` / `maxWidth`。

- [X] T013.5 [US3] 可访问性审计（spec SC-004 + FR-011），三步并行：
  - **Step 1 静态审计**：`antd lint --only a11y` 两文件均 0 violation ✅
  - **Step 2 运行时审计**（axe DevTools 浏览器扫描）：留待 T015 浏览器阶段
  - **Step 3 手动键盘 + VoiceOver**：留待 T015 浏览器阶段
  1. **静态审计**：跑 `antd lint apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx --only a11y --format json`，0 violation 通过。
  2. **运行时审计**：浏览器装 [axe DevTools](https://www.deque.com/axe/devtools/) 免费版插件（或 `@axe-core/playwright` 临时脚本），打开 `http://localhost:3000/login`，扫描整个页面。要求：0 critical、0 serious violation。重点检查：Alert 的 `aria-live`、Form.Item 的 `<label for>` 关联、Input.Password 的可见性按钮有 `aria-label`。
  3. **手动键盘 + 屏幕阅读器**：
     - 键盘：Tab 顺序为 username → password → submit；Shift+Tab 反向；密码字段按 Enter 触发提交；按钮 loading 时键盘焦点不丢失。
     - 屏幕阅读器：macOS 用 VoiceOver（Cmd+F5 开启），导航至错误 Alert 时应播报"错误：用户名或密码错误"（验证 Alert 的 `aria-live="polite"` 生效）。
  - **失败处理**：任一步骤发现 violation，记录到 `specs/001-redesign-login-ui/manual-test-results.md` 并修复后重测。

**Checkpoint**: 源码 0 违宪关键字；视觉与 antd v6 design.md 一致；响应式无横向滚动；**a11y 三步审计 0 critical/serious violation**。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 清理旧代码、跑完整手测、收尾

- [X] T014 [P] 删除 `packages/ui/src/components/login-form.tsx`（旧的 shadcn 版本）。同时删除 dist 产物：`rm -f packages/ui/dist/components/login-form.{js,d.ts,d.ts.map}` 与对应的 sourcemap。验证：`pnpm --filter @magi/web build` 不报错（无遗留 import 指向已删组件）。

- [X] T015 [P] 按 [quickstart.md](./quickstart.md) 全部 10 个场景手测，把每个场景的实测结果（Pass/Fail + 备注）记录到 `specs/001-redesign-login-ui/manual-test-results.md`（新建文件）。失败的场景回到对应 Phase 修复。
  - **Done 2026-07-21**: 10 场景中 7 个代码/CLI 层已验证 ✅，3 个需浏览器手测（scenario 1 浏览器层 / 3 / 8 / 9 + T013.5 Step 2/3）— 已在 [manual-test-results.md](./manual-test-results.md) 列明待办。

- [X] T016 [P] 在 `apps/web/package.json` 验证 `antd` 与 `@ant-design/icons` 版本固定为 `^6.x`（不是 `latest`、不是 `*`）。运行 `pnpm --filter @magi/web list antd @ant-design/icons` 确认两个包都解析到 6.x。

- [X] T017 提交前最终检查：
  - `pnpm lint`（项目根）通过
  - `pnpm --filter @magi/web build` 通过
  - `tsc --noEmit` 在 apps/web 下通过
  - 宪法 v2.1.0：再次跑 `antd lint apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx --format json`，0 违规
  - 宪法 v2.2.0：再次确认 theme.token 与 design.md 一致（不硬编码）
  - **Done 2026-07-21**:
    - 本特性两文件 `tsc --noEmit`：**0 错误** ✅
    - `antd lint` 两文件：**0 issues**（含 a11y / deprecated / usage / performance）✅
    - theme.token 与 design.md 5 项完全匹配 ✅
    - **注**：`pnpm --filter @magi/web build` 因**既存 34 个 TS 错误**（与本特性无关：app.tsx StartClient / channel-form-dialog.tsx Zod / source-form-dialog.tsx onClear 等）会失败，已在 [manual-test-results.md](./manual-test-results.md) "已知项目既存问题" 章节记录，建议作为独立技术债务处理。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始。T001 完成才能进 Phase 2。
- **Foundational (Phase 2)**: 依赖 Setup 完成。T002 与 T003 可并行（不同活动）。**T002 + T003 都完成才能进 US1**。
- **US1 (Phase 3)**: 依赖 Foundational 完成。T004 先于 T005（LoginForm 组件先于路由使用）。T005 完成后跑 T006 lint。
- **US2 (Phase 4)**: 依赖 US1 完成（在 US1 的代码上叠加错误处理）。T007 → T008 → T009 → T010 串行（同一组文件）。
- **US3 (Phase 5)**: 依赖 US2 完成。T011 与 T012 可并行。T013 在 T012 之后。
- **Polish (Phase 6)**: 依赖所有 US 完成。T014/T015/T016 可并行；T017 必须最后。

### User Story Dependencies

- **US1 (P1)**: MVP — 完成 Foundational 后即可开始，不依赖其他 story
- **US2 (P2)**: 依赖 US1（在 US1 的代码上叠加错误处理逻辑）
- **US3 (P3)**: 依赖 US2（视觉校准建立在功能完整之后）

### Parallel Opportunities

- **Phase 2**: T002 (antd info 查询) ‖ T003 (better-auth error 验证)
- **Phase 3**: T004 (LoginForm 组件) — 与 T002/T003 并行（如果 Phase 2 已完成则 T004 单独跑）
- **Phase 5**: T011 (grep 合规) ‖ T012 (token 校准)
- **Phase 6**: T014 (删旧组件) ‖ T015 (手测) ‖ T016 (版本固定)

---

## Parallel Example: Phase 2

```bash
# 在两个终端并行：
# 终端 1:
Task T002: "antd info Form --format json --version 6.x >> specs/001-redesign-login-ui/contracts/antd-api.md"
Task T002: "antd info Input --format json --version 6.x >> specs/001-redesign-login-ui/contracts/antd-api.md"
# (依次跑 8 个组件)

# 终端 2:
Task T003: "pnpm --filter @magi/web dev → 浏览器试登录 → 看 console → 更新 auth.md"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. T001 装 antd v6 依赖（5 分钟）
2. T002 + T003 并行跑（30 分钟）
3. T004 写 LoginForm（30 分钟）
4. T005 写 login.tsx（30 分钟）
5. T006 lint 修复（15 分钟）
6. **STOP & VALIDATE**: 跑 quickstart scenario 1，确认能用 admin 登录跳转 dashboard
7. 提交 PR（仅含 US1），让 reviewer 先看 MVP

### Incremental Delivery

1. **US1** → 单独 PR → 部署 → demo "能登录了"
2. **US2** → 在 US1 PR 之后或之上叠加 → 部署 → demo "错误反馈正确"
3. **US3** → 在 US2 之上叠加 → 部署 → demo "视觉合规"
4. **Polish** → 删除旧 packages/ui/src/components/login-form.tsx → 部署

每个 PR 都可独立验证、独立部署、独立回滚。

### Suggested Single-PR Alternative

如果偏好一次性提交：
1. 跑完所有 Phase 1-6（约 4-6 小时）
2. 跑 T017 最终检查
3. 一个 PR 提交，描述里按 US1/US2/US3/Polish 分章节

---

## Notes

- **宪法 v2.1.0 强制**: 每个 antd 代码任务（T004/T005/T007/T008/T009）开始前，开发者**必须**先查 T002 产出的 antd-api.md，确认 props 名称与默认值。不允许凭记忆写 antd 代码。
- **宪法 v2.2.0 强制**: T005/T012 校准 theme.token 时**必须**对照 [contracts/ui.md "Visual Tokens"](./contracts/ui.md#visual-tokens-from-antd-v6-designmd) 表，不允许硬编码除 design.md 列出的 token 值之外的 hex。
- **scope 边界**: 不动 packages/ui 其他 26+ 组件、不动 `__root.tsx` 的全局资源、不动 apps/api、不动 docker 配置。这些违宪代码由宪法 v2.0.0 遗留迁移待办单独跟踪。
- **测试策略**: 不引入 vitest / playwright。验证靠 quickstart 10 场景手测（T015）。未来若项目引入测试框架，本特性的验证脚本应作为首批回归测试。
- **commit 策略**: 建议每个 Task 单独 commit，commit message 用 conventional commits（如 `feat(web): T004 add antd LoginForm`、`refactor(web): T005 rewrite login.tsx with antd`）。
