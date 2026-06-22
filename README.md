# MAGI - Personal EPG + Live TV Platform

个人 EPG（电子节目指南）与 Live TV 管理平台。支持 XMLTV 导入、频道管理、节目单管理、异步任务处理，以及 Android TV 客户端。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | TanStack Start (Vite), TanStack Router, React 19, TailwindCSS 4, shadcn/ui, TanStack Query, TanStack Table, Zustand |
| Auth | better-auth (邮箱密码) |
| Backend | NestJS, Drizzle ORM, PostgreSQL, Redis, BullMQ, Zod |
| Infra | Docker, Docker Compose, Turborepo, pnpm |

## Project Structure

```
magi/
├── apps/
│   ├── web/          # TanStack Start 管理后台
│   ├── api/          # NestJS 核心 API
│   ├── worker/       # BullMQ 异步任务
│   └── tv/           # Android TV (Phase 2，尚未创建)
├── packages/
│   ├── types/        # 共享类型 + Zod Schema
│   ├── ui/           # 共享 UI 组件 (shadcn/ui)
│   ├── utils/        # 公共工具库 (date/logger/pagination)
│   ├── backend-core/ # API 与 Worker 共享层 (schema/parsers/epg-matcher)
│   └── tsconfig/     # 共享 TS 配置
├── docker/           # Docker 配置
└── docs/             # 项目文档
```

## Backend Architecture

```
Controller → UseCase → Repository Interface → Repository Impl → Database
```

- **Controller** — 只做参数校验、DTO 转换
- **UseCase** — 业务编排、事务控制
- **Repository Interface** — 数据访问抽象
- **Repository Implementation** — Drizzle ORM 实现
- **Domain Model** — 业务规则，不依赖框架

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- Docker & Docker Compose

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure

```bash
bash scripts/init-dev.sh
```

### 3. Setup Database

`bash scripts/init-dev.sh` 会自动创建本地 `docker/.env`、启动 PostgreSQL/Redis、执行数据库迁移并创建本地管理员账号。
默认本地管理员账号为 `admin / zxcv1234`。
如需手动执行：

```bash
bash scripts/docker-up.sh
pnpm --filter @magi/api db:generate
pnpm --filter @magi/api db:migrate
pnpm --filter @magi/api seed
```

### 4. Start Development

```bash
# Start all services
pnpm dev

# Or start individually
pnpm --filter @magi/api dev     # API on :3001
pnpm --filter @magi/web dev     # Web on :3000
pnpm --filter @magi/worker dev  # Worker
```

### 5. Docker Commands

```bash
# Start local infrastructure
bash scripts/docker-up.sh

# Stop local infrastructure
bash scripts/docker-down.sh
```

## Available Commands

`package.json` 只保留基础开发命令；Docker 和初始化流程统一放在 `scripts/*.sh`。

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages and apps |
| `pnpm clean` | Clean all build outputs |

## API Endpoints

Base URL: `http://localhost:3001`。除 `/api/auth/*` 外，接口需登录（better-auth session）。

### Dashboard

| Endpoint | Description |
|----------|-------------|
| `GET /dashboard/stats` | 仪表盘统计数据 |
| `GET /dashboard/health-summary` | 源/流健康概览 |

### Sources (M3U / XMLTV)

| Endpoint | Description |
|----------|-------------|
| `GET /sources` | 列出源（按 `?type=m3u\|xmltv` 过滤） |
| `GET /sources/:type/:id` | 获取单个源 |
| `POST /sources` | 创建源 |
| `PUT /sources/:type/:id` | 更新源 |
| `DELETE /sources/:type/:id` | 删除源 |
| `POST /sources/:type/:id/sync` | 同步源（入队异步任务） |
| `POST /sources/:type/:id/check` | 检查源可用性 |

### Channels / Programmes（原始导入数据）

| Endpoint | Description |
|----------|-------------|
| `GET /channels` | 列出原始频道 |
| `GET /channels/:id` | 获取单个原始频道 |
| `GET /programmes` | 列出节目单 |
| `GET /programmes/:id` | 获取单个节目 |

### Output（输出频道编排）

| Endpoint | Description |
|----------|-------------|
| `GET /output/channels` | 列出输出频道 |
| `GET /output/channels/:id` | 获取输出频道详情 |
| `POST /output/channels/batch` | 批量创建/更新输出频道 |
| `PUT /output/channels/:id` | 更新输出频道（含覆盖） |
| `GET /output/channels/:id/streams` | 列出频道的码流 |
| `POST /output/channels/:id/streams` | 添加码流 |
| `PUT /output/channels/:id/streams/:streamId` | 更新码流 |
| `DELETE /output/channels/:id/streams/:streamId` | 删除码流 |
| `POST /output/channels/:id/streams/:streamId/primary` | 设为主码流 |
| `POST /output/channels/:id/logo` | 上传 Logo |
| `GET /output/groups` | 按分组聚合频道 |
| `GET /output/m3u` | 生成 M3U 播放列表 |
| `GET /output/xmltv` | 生成 XMLTV 节目单 |
| `POST /output/check-streams` | 批量检测码流可用性 |

### EPG（匹配 / 导入 / 刷新）

| Endpoint | Description |
|----------|-------------|
| `GET /epg/channels` | 可用于匹配的 EPG 频道 |
| `POST /epg/match/:sourceId` | 对源执行 EPG 匹配 |
| `POST /epg/import/:sourceId` | 导入 EPG 源 |
| `POST /epg/refresh/:sourceId` | 刷新 EPG 源 |

### Tasks（异步任务 + 定时调度）

| Endpoint | Description |
|----------|-------------|
| `GET /tasks` | 列出任务 |
| `GET /tasks/:id` | 获取任务详情 |
| `POST /tasks/:id/retry` | 重试任务 |
| `POST /tasks/:id/cancel` | 取消任务 |
| `GET /tasks/scheduled` | 列出定时任务 |
| `PUT /tasks/scheduled/:jobId` | 更新定时任务 |
| `POST /tasks/scheduled/:jobId/trigger` | 手动触发定时任务 |

## License

Private - All rights reserved.
