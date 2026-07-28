# Quickstart: 重构登录页面 UI 验证

**Feature**: 001-redesign-login-ui
**Date**: 2026-07-20
**Related**: [spec.md](./spec.md), [contracts/ui.md](./contracts/ui.md), [contracts/auth.md](./contracts/auth.md)

本文档描述**端到端验证场景**，证明重构后的登录页符合 spec 要求。**不含**完整代码实现（实现见 tasks.md 与代码源文件）。

## Prerequisites

- Docker Desktop / OrbStack 已启动
- pnpm ≥ 10、Node ≥ 20（项目根 `package.json` engines 要求）
- 端口 15432（postgres）、16379（redis）、3000（web）、3001（api）空闲
- 已 clone 仓库并 `pnpm install` 过

## Setup

```bash
# 1. 启动 postgres + redis 容器（如未启动）
bash scripts/init-dev.sh

# 期望输出末尾：
#   Container magi-postgres  Healthy
#   Container magi-redis     Healthy
#   Admin user "admin" created successfully.
#   MAGI dev environment is ready.

# 2. 启动 web dev server（新终端）
pnpm --filter @magi/web dev

# 期望：vite 输出 "Local: http://localhost:3000/"

# 3. 启动 api dev server（新终端）
pnpm --filter @magi/api dev
```

如果遇到 Redis `ECONNREFUSED` 等错误，先确认 `docker/.env` 包含 `REDIS_URL=redis://localhost:16379`（见 docker-up 修复历史）。

## Test Scenarios

### Scenario 1 — 正常登录（spec P1 / FR-001/005/007）

**Steps**:

1. 浏览器打开 `http://localhost:3000/login`
2. 输入用户名 `admin`、密码 `zxcv1234`（来自 `docker/.env`）
3. 点击"登录"按钮

**Expected**:

- 按钮立即显示 loading 状态、字段 disabled
- 1 秒内跳转至 `http://localhost:3000/dashboard`
- URL 栏变化（`replace`，不是 push）
- 刷新页面（F5）后仍在 dashboard，不会回到登录页

### Scenario 2 — 凭据错误（spec P2 / FR-004）

**Steps**:

1. 浏览器打开 `http://localhost:3000/login`
2. 输入用户名 `admin`、密码 `wrong_password`
3. 点击"登录"

**Expected**:

- 表单上方 Alert 显示"用户名或密码错误"（红色，带图标）
- 密码字段清空
- 光标自动聚焦到密码字段
- **不能**通过文案判断"是用户名错还是密码错"
- Alert 文案无技术细节（不暴露 HTTP 401 / status）

### Scenario 3 — 系统错误（spec P2 acceptance 2.2）

**Steps**:

1. 模拟后端不可用：在另一个终端 `pnpm --filter @magi/api dev` 处按 Ctrl+C 停掉 api
2. 浏览器打开 `http://localhost:3000/login`
3. 输入正确凭据，点"登录"

**Expected**:

- 表单上方 Alert 显示"登录暂时不可用，请稍后重试"
- 登录按钮恢复可点击状态（loading 消失）
- 用户名/密码字段不清空（用户可重试）

### Scenario 4 — 表单最小校验（spec FR-003）

**Steps**:

1. 打开 `/login`
2. 留空用户名或密码
3. 点击"登录"

**Expected**:

- antd Form 在对应字段下显示"请输入用户名"/"请输入密码"
- 不发起网络请求（浏览器 Network 面板无 `/api/auth/...` 调用）

### Scenario 5 — 已登录重定向（spec FR-006）

**Steps**:

1. 完成场景 1 的登录
2. 浏览器地址栏输入 `http://localhost:3000/login`

**Expected**:

- 浏览器立即重定向至 `/dashboard`，不展示登录表单

### Scenario 6 — Callback URL 跳转（spec P1 acceptance 1.3）

**Steps**:

1. 退出登录（清 cookies 或在 DevTools → Application → Cookies 删除 session）
2. 浏览器直接访问 `http://localhost:3000/channels`（假设有此路由；如无则用 `/dashboard` 模拟）
3. 应被重定向至 `/login?callbackUrl=%2Fchannels`
4. 输入正确凭据登录

**Expected**:

- 登录成功后跳转至 `/channels`（而非 `/dashboard`）

### Scenario 7 — 视觉一致性（spec P3 / FR-008）

**Steps**:

1. 打开重构后的 `/login`
2. 同时打开 `http://localhost:3000/dashboard`（即使违宪的 shadcn 页面也行，用来对比"未来 antd 化"的目标视觉）
3. 用 antd 官网 v6 示例（`https://ant.design/components/form-cn`）作第三方对照

**Expected**:

- `/login` 的圆角（6px）、间距（4px 倍数）、字号（14px）、主色（`#1677FF`）与 antd 官方示例**一致**
- 源码 grep：`grep -rE 'className="(flex|grid|bg-|text-)' apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx` **无任何输出**（无 Tailwind utility class）
- 源码 grep：`grep -rE 'shadcn|radix|@/components/ui/' apps/web/src/routes/login.tsx apps/web/src/components/login-form.tsx` **无任何输出**

### Scenario 8 — 响应式（spec FR-009 / SC-004）

**Steps**:

1. DevTools → Toggle Device Toolbar
2. 选 "iPhone SE" (375×667) 与 "Desktop 1440×900" 两个断点

**Expected**:

- 两种尺寸下表单完整可见、无横向滚动条
- 表单容器宽度自适应（移动端近屏宽、桌面端最大 400px）
- 按钮始终占满容器宽度（block）

### Scenario 9 — 自动填充兼容（spec Edge Cases）

**Steps**:

1. 在浏览器密码管理器（1Password / Chrome Save Password）中存入 magi admin 凭据
2. 打开 `/login`
3. 让密码管理器自动填充

**Expected**:

- 用户名/密码字段被正确填充，不被遮挡
- antd Input 的样式不被自动填充破坏（背景色、文字色正常）

### Scenario 10 — 重复点击防护（spec FR-007 / Edge Cases）

**Steps**:

1. 打开 `/login`
2. 输入正确凭据
3. **快速连点**登录按钮 5 次

**Expected**:

- 只发起一次 `/api/auth/sign-in/username` 请求（DevTools Network 验证）
- 第一次点击后按钮立即 disabled，后续点击无效

## Out-of-Scope Verification

以下**不在本特性验证范围**：

- 注册账号、忘记密码流程
- 双因子认证 / OAuth
- Dark mode 切换
- 其他后台页（`/dashboard`、`/channels` 等）的 antd 化
- packages/ui 其他 26+ 组件的重写

这些由后续特性或宪法 v2.0.0 遗留迁移待办跟踪。

## Tear Down

```bash
# 关闭 dev server（Ctrl+C 各终端）
# 容器保留供下次开发
# 如需彻底清掉容器与数据：
# bash scripts/docker-down.sh  # 不删数据卷
# docker compose -f docker/docker-compose.yml down -v  # ⚠ 删数据卷，会丢库
```
