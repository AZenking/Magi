# MAGI Platform Architecture Guide

> Personal EPG + Live TV Platform
>
> Author: Ethan Young
>
> Architecture Version: v1.0

---

# Overview

MAGI 是一个面向个人长期维护的 EPG（Electronic Program Guide）与 Live TV 平台。

项目目标：

- EPG 数据管理
- XMLTV 导入
- Live TV 管理
- Android TV 客户端
- Web 管理后台
- 后续 Mobile 支持
- 长期可维护
- 单人开发友好

本项目采用：

```txt
Monorepo
+
Modular Monolith
+
Clean Architecture
+
Worker Async Processing
```

---

# Technology Stack

## Frontend

```txt
TanStack Start (Vite)
React 19
TypeScript
antd v6
TanStack Query
TanStack Table
TanStack Virtual
Zustand
```

---

## Backend

```txt
NestJS
Drizzle ORM
PostgreSQL
Redis
BullMQ
Zod
```

---

## Infrastructure

```txt
Docker
Docker Compose
Cloudflare Tunnel
GitHub Actions
Synology NAS
```

---

# Repository Structure

```txt
magi/

apps/
├── web/
├── api/
├── worker/
└── tv/

packages/
├── types/
├── ui/
├── utils/
├── eslint-config/
└── tsconfig/

docs/
```

---

# Applications

## web

Web 管理后台

职责：

- EPG源管理
- Channel管理
- Programme管理
- Task管理
- 系统配置

原则：

```txt
只负责展示和交互
不包含业务逻辑
```

---

## api

核心业务服务

职责：

```txt
认证授权
业务编排
任务调度
数据访问
```

原则：

```txt
所有业务入口统一进入 API
```

---

## worker

异步任务服务

职责：

```txt
XMLTV导入
数据同步
数据清洗
定时刷新
```

原则：

```txt
耗时操作全部异步化
```

---

## tv

TV客户端

职责：

```txt
频道浏览
节目单展示
播放器
```

技术边界：

```txt
Compose UI / ViewModel
        ↓
UseCase / Domain Port
        ↓
Data Repository / Platform Adapter
        ↓
Retrofit / DataStore / Media3
```

规则：

- `domain/` 不依赖 Android、Compose、Retrofit、DataStore 或 Media3。
- UI/ViewModel 不直接依赖 `data/` 具体类；最后频道、设置、诊断、播放器均通过
  domain/application 接口或 UseCase。
- Retrofit DTO 只存在于 data 层，并映射为 domain model。开放接口的跨语言真相源是
  `/api/open.json`，不是手工复制的 TypeScript/Kotlin 接口。
- Media3 播放器只有一个生命周期所有者。换台复用播放器，并拒绝旧请求或旧回调覆盖
  新频道状态。
- Composable 只渲染 `UiState` 与发送用户意图，不直接访问 MediaCodec、网络或存储。

交互与可靠性：

- 所有核心流程只依赖 D-pad、OK 和 Back；页面、侧栏、弹层必须定义初始焦点与恢复焦点。
- Back 顺序固定为最上层弹层/侧栏、信息层、上一页面、退出应用。
- 播放状态必须显式区分线路解析、缓冲、首帧、线路切换、可恢复错误和终止错误。
- 配置保存前验证服务端与 API Key；应用内始终保留重新配置入口。
- API Key 使用 Android Keystore 支持的加密存储，诊断与日志不得包含明文凭据或完整流地址。
- 关键正文不小于 16sp、辅助正文不小于 14sp、交互目标不小于 48dp；焦点反馈不能只依赖颜色。
- 焦点、Back 或播放链路变更必须通过模拟器与真实遥控器设备验收。

---

# Shared Packages

## packages/types

共享类型定义

包含：

```txt
DTO
Enum
VO
Zod Schema
```

作用：

```txt
前后端统一类型
```

---

## packages/ui

共享UI组件

包含：

```txt
Button
Dialog
Table
Pagination
SearchBar
```

---

## packages/utils

公共工具库

包含：

```txt
Date
Logger
Pagination
Formatter
```

---

# Backend Architecture

目录结构：

```txt
src/

http/

application/

domain/

infrastructure/

shared/
```

---

# Layer Design

```txt
Controller

↓

UseCase

↓

Repository Interface

↓

Repository Implementation

↓

Database
```

依赖方向只能向下。

---

# HTTP Layer

目录：

```txt
http/

channel/
programme/
epg/
task/
source/
```

职责：

```txt
接收请求
参数校验
DTO转换
返回响应
```

禁止：

```txt
业务逻辑
数据库操作
```

示例：

```ts
@Get()
findAll()
```

---

# Application Layer

项目最重要的一层。

目录：

```txt
application/

channel/

programme/

epg/

task/

source/
```

示例：

```txt
CreateChannelUseCase

UpdateChannelUseCase

DeleteChannelUseCase

ImportEpgUseCase

RefreshEpgUseCase
```

职责：

```txt
业务规则
权限校验
事务控制
流程编排
```

原则：

```txt
一个 UseCase
对应一个业务动作
```

---

# Domain Layer

目录：

```txt
domain/

channel/

programme/

epg/
```

职责：

```txt
业务规则
领域模型
状态转换
```

例如：

```txt
节目是否冲突

频道是否允许删除

节目是否允许覆盖
```

原则：

```txt
不依赖数据库
不依赖框架
```

---

# Infrastructure Layer

目录：

```txt
infrastructure/

database/

repositories/

redis/

bullmq/

xmltv/
```

职责：

```txt
实现技术细节
```

例如：

```txt
Drizzle

Redis

BullMQ

XML Parser
```

---

# Repository Pattern

业务层依赖接口：

```ts
interface ProgrammeRepository
```

基础设施层实现：

```ts
class DrizzleProgrammeRepository
```

原则：

```txt
UseCase 不关心 ORM
UseCase 不关心数据库
```

---

# Request Flow

同步请求：

```txt
Browser

↓

Controller

↓

UseCase

↓

Repository

↓

Database
```

---

异步任务：

```txt
Browser

↓

API

↓

BullMQ

↓

Worker

↓

UseCase

↓

Repository
```

---

# Worker Architecture

目录：

```txt
apps/worker/src

application/

domain/

infrastructure/
```

原则：

```txt
与 API 保持一致架构
```

---

# XMLTV Import Flow

```txt
导入XMLTV

↓

创建Task

↓

加入Queue

↓

Worker消费

↓

解析XML

↓

业务处理

↓

保存结果

↓

更新Task状态
```

---

# Frontend Architecture

目录：

```txt
src/

components/

features/

hooks/

services/

stores/
```

---

# Features First

推荐：

```txt
features/

channel/

programme/

task/

epg/
```

避免：

```txt
components/
放所有代码
```

---

# State Management

## Server State

统一使用：

TanStack Query

职责：

```txt
缓存
分页
刷新
同步
```

---

## Client State

统一使用：

Zustand

职责：

```txt
Theme

Sidebar

Player

TV Focus
```

---

# Design Principles

## Controller

只做：

```txt
接收请求
```

---

## UseCase

只做：

```txt
业务逻辑
```

---

## Repository

只做：

```txt
数据访问
```

---

## Domain

只做：

```txt
业务规则
```

---

# Evolution Path

阶段一：

```txt
Web
API
Worker
```

---

阶段二：

```txt
增加 TV Client
```

---

阶段三：

```txt
增加 Mobile
```

---

阶段四：

```txt
增加 Crawler Service
```

---

# Final Architecture

```txt
Monorepo (Turborepo)

apps/
├── web
├── api
├── worker
└── tv

packages/
├── types
├── ui
├── utils
└── configs

Frontend
    ↓

REST API
    ↓

NestJS
    ↓

UseCase
    ↓

Repository
    ↓

Drizzle
    ↓

PostgreSQL

BullMQ
    ↓

Worker
```

---

# Core Philosophy

```txt
Controller 不写业务

UseCase 不写 SQL

Repository 不写业务

Domain 不依赖框架

Worker 专注异步任务

前后端共享类型

业务优先于框架
```

该架构适用于：

- EPG 平台
- IPTV 平台
- CMS 系统
- SaaS 管理后台
- 个人长期维护项目

目标是在保证开发效率的同时，获得长期可维护性与可扩展性。
