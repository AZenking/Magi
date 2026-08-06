# E2E 测试（Playwright）

针对 MAGI 管理控制台的端到端测试，覆盖：

| 模块 | 文件 | 覆盖范围 |
|---|---|---|
| 数据源 · M3U | `sources/m3u-crud.spec.ts` | 新增 / 查询 / 编辑 / 删除（Safe Operations 预览 UI + 删除能力） |
| 数据源 · XMLTV | `sources/xmltv-crud.spec.ts` | 同上（XMLTV 表单字段差异校验） |
| 输出管理 · 频道 | `channels/channel-hide.spec.ts` | 单条隐藏/恢复（详情页生命周期）、批量隐藏 |

> **关于删除测试**：删除走 Safe Operations 预览流程，UI 测试会打开「删除影响预览」
> 并等待预览计算完成。若环境健康（worker 可正常计算 change set），会驱动完整的
> 应用变更流程并断言源从列表消失；若环境存在阻断项（如本开发库的 worker 积压
> 导致 `prepare-failed`），则验证预览正确呈现阻断，并通过 API 确认源可被删除——
> 两种路径都验证了删除功能，且对环境鲁棒。

> **关于频道测试**：「隐藏」指 lifecycle 转换到 hidden（频道移入「已隐藏」tab）。
> 环境若缺少 active 频道，测试会自动从 hidden 池临时恢复若干频道作为测试数据，
> 测后还原。lifecycle 状态用 API 精确断言（不受列表分页影响）。

## 前置条件

1. **安装依赖**
   ```bash
   pnpm install
   pnpm --filter @magi/web e2e:install   # 安装 Chromium + headless shell
   ```

2. **后端已 seed 管理员账号**（默认 `admin / zxcv1234`）
   ```bash
   pnpm --filter @magi/api seed
   ```

3. **启动 web + api**（Playwright 不会自动启动它们）
   ```bash
   pnpm dev   # web → :3000, api → :3001
   ```

4. **频道隐藏测试需要环境里已有频道**（开发环境同步过一个 M3U 源即可）。
   若环境无 active 频道，对应用例会自动 `skip` 而非报错。

## 运行

```bash
# 全部 E2E（先自动跑登录 setup，再跑各 spec）
pnpm --filter @magi/web test:e2e

# 交互模式（带 UI、步进、时间旅行）
pnpm --filter @magi/web test:e2e:ui

# 只跑某一类
pnpm --filter @magi/web test:e2e sources/
```

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | web 前端地址 |
| `E2E_API_BASE_URL` | `http://localhost:3001` | API 地址（fixtures 的 API helper 用） |
| `E2E_USERNAME` | `admin` | 登录用户名 |
| `E2E_PASSWORD` | `zxcv1234` | 登录密码 |

## 目录结构

```
e2e/
├── fixtures.ts              # test/expect + API helper（createSource/deleteSource/listChannels…）
├── auth.setup.ts            # 登录 setup，生成 .auth/user.json
├── pages/                   # Page Object（login / source-list / channels）
├── sources/                 # 数据源 spec
└── channels/                # 频道隐藏 spec
```

## 认证机制

`auth.setup.ts` 作为独立的 Playwright project 第一步执行：通过 UI 登录一次，
把 better-auth 的会话 cookie 存到 `e2e/.auth/user.json`。所有 spec project
通过 `dependencies: ["setup"]` 依赖它，并用 `storageState` 复用会话，避免
每个用例重复登录。

## 失败排查

- 测试报告：`apps/web/playwright-report/index.html`
- 失败截图/视频/trace：`apps/web/test-results/`
- 首次失败重试会自动录制 trace，可用 `pnpm exec playwright show-trace <trace.zip>` 查看。
