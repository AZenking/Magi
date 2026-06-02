# MAGI - Personal EPG + Live TV Platform

个人 EPG（电子节目指南）与 Live TV 管理平台。支持 XMLTV 导入、频道管理、节目单管理、异步任务处理，以及 Android TV 客户端。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TailwindCSS 4, shadcn/ui, TanStack Query, Zustand |
| Backend | NestJS, Drizzle ORM, PostgreSQL, Redis, BullMQ, Zod |
| Infra | Docker, Docker Compose, Turborepo, pnpm |

## Project Structure

```
magi/
├── apps/
│   ├── web/          # Next.js 管理后台
│   ├── api/          # NestJS 核心 API
│   ├── worker/       # BullMQ 异步任务
│   └── tv/           # Android TV (Phase 2)
├── packages/
│   ├── types/        # 共享类型 + Zod Schema
│   ├── ui/           # 共享 UI 组件
│   ├── utils/        # 公共工具库
│   ├── tsconfig/     # 共享 TS 配置
│   └── eslint-config/# 共享 ESLint 配置
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

| Endpoint | Description |
|----------|-------------|
| `GET /channels` | List channels |
| `POST /channels` | Create channel |
| `GET /programmes` | List programmes |
| `POST /epg/sources/:id/import` | Import EPG source |
| `GET /tasks` | List tasks |

## License

Private - All rights reserved.
