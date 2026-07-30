# Data Model: 开放接口平台 — 频道与节目单只读 API

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29

> 本特性**不新增任何业务数据表**(频道/节目单复用现有 canonical/programmes)。仅新增一张**凭据表** `api_keys`。所有业务实体是对现有数据的**只读投影**(不落库)。

---

## 新增实体

### `api_keys`(API 访问凭据)

| 列 | Drizzle 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` | |
| `name` | `varchar(120)` | `notNull()` | 人类可读名称,如"客厅电视""导出脚本" |
| `key_hash` | `varchar(64)` | `notNull()`, `unique()` | `sha256(明文)` 的 hex;**永不存明文**(FR-002) |
| `key_prefix` | `varchar(12)` | `notNull()` | 打码前缀,如 `magi_3f9a…`;列表识别用 |
| `status` | `varchar(20)` | `notNull()`, `default("active")` | `active` \| `disabled` \| `revoked` |
| `expires_at` | `timestamp(tz)` | nullable | null = 长期有效(FR-006) |
| `scopes` | `jsonb` | nullable | 预留作用域(频道可见性等),首版不实现(D4) |
| `last_used_at` | `timestamp(tz)` | nullable | 最近成功校验时间 |
| `created_by` | `varchar(255)` | `notNull()` | 创建它的管理员 user.id(审计用) |
| `version` | `integer` | `notNull()`, `default(1)` | 乐观锁(首版不强制 If-Match,留扩展) |
| `created_at` | `timestamp(tz)` | `defaultNow()`, `notNull()` | via `timestamps` |
| `updated_at` | `timestamp(tz)` | `defaultNow()`, `notNull()` | via `timestamps` |

**索引**:
- `unique(key_hash)` — 主校验路径,O(1) 查找
- `index(status)` — 列表按状态过滤

**状态流转(`ApiKeyStatus` 状态机)**:
```
        create          disable         enable
  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
  │   active    │⇄│   disabled    │   │   active     │
  └─────────────┘   └──────────────┘   └──────────────┘
        │                  │                  │
        │ revoke           │ revoke           │ revoke
        ▼                  ▼                  ▼
  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
  │  revoked    │   │   revoked    │   │   revoked    │  (终态,不可逆)
  └─────────────┘   └──────────────┘   └──────────────┘
        │                  │                  │
        │ delete (cascade) │                  │
        ▼                  ▼                  ▼
                     (row removed)
```
- `active ⇄ disabled`:管理员可逆切换(FR-004)
- `→ revoked`:**单向终态**,不可恢复(FR-004/US5-AC1)
- `→ delete`:物理删除,行移除(无论何种状态均可)
- 校验时仅 `status === "active"` 且(`expires_at` 为 null 或 `> now()`)才放行(FR-007)

**明文格式**:`magi_<32 chars base62>`(前缀 `magi_` 便于人眼识别来源),总长 37。`key_hash = sha256(明文).toString("hex")`(64 字符)。`key_prefix = 明文.slice(0, 8) + "…"`(如 `magi_3f9…`)。

---

## 复用实体(只读投影,不新增表)

### 对外频道(产品视图)— `OpenChannelVo`

从现有 `CanonicalChannel`(domain model,源自 `canonical_channels` 表)投影:

| 投影字段 | 来源 | 说明 |
|---|---|---|
| `id` | `magi:{canonicalChannel.id}` | 稳定对外标识(FR-015),与 V2 输出一致 |
| `name` | `canonicalChannel.standardName` | |
| `group` | `canonicalChannel.standardGroup` | nullable |
| `logo` | `canonicalChannel.standardLogo` | nullable |
| `channelNumber` | `canonicalChannel.channelNumber` | nullable |

**可见性规则**(FR-011):仅 `shouldBeInOutput() === true` 的频道出现(即 `lifecycle === "active"` 且未隐藏/停用/回收)。

**不投影**(FR-012):`streamUrl`、`primaryStreamId`、`epgChannelId`、`epgMatchType`、`epgStatus`、`outputStatus`、`healthStatus`、`lifecycle`、`lifecycleReason`、`trashedAt`、`purgeAfter`、`sourceId` 等所有运维字段。

### 对外节目(产品视图)— `OpenProgrammeVo`

从现有 `Programme`(domain model,经 EPG 绑定关联到 canonical channel)投影:

| 投影字段 | 来源 |
|---|---|
| `channelId` | `magi:{绑定后的 canonicalChannel.id}` |
| `title` | `programme.title` |
| `subTitle` | `programme.subTitle`(可选展示) |
| `startAt` | `programme.startAt`(ISO 8601) |
| `stopAt` | `programme.stopAt`(ISO 8601) |
| `category` | `programme.category` |

**可见性规则**(FR-011/US3-AC3):仅关联到对外可见频道的节目返回。

### 分组聚合 — `OpenGroupVo`

| 字段 | 来源 |
|---|---|
| `name` | `canonicalChannel.standardGroup` |
| `count` | 该分组的对外可见频道数 |

源自 `FindCanonicalChannelsUseCase.findGroups()`。

---

## 错误码扩展(ProblemDetailsFilter)

新增以下错误码,沿用现有 `application/problem+json` 形态:

| code | HTTP | 触发 |
|---|---|---|
| `api-key-required` | 401 | 开放接口请求未携带凭据 |
| `api-key-invalid` | 401 | 凭据不存在/已禁用/已吊销/已过期(统一返回,不区分原因,FR-007/Edge) |
| `rate-limit-exceeded` | 429 | 超出限流阈值(FR-020) |

> 故意不区分"禁用/吊销/过期",避免凭据枚举探测(Edge Case)。

---

## 与现有审计的集成

`api_keys` 的管理操作(创建/禁用/启用/吊销/删除)复用现有 `AppendAuditEventUseCase`,审计事件字段映射:
- `actor` = 管理员 user.id(经 `@CurrentUser` 取)
- `action` ∈ `{api_key.created, api_key.disabled, api_key.enabled, api_key.revoked, api_key.deleted}`
- `target` = `api_key:{id}`
- `requestId` = `currentRequestId()`

不新增审计表(`audit_events` 已存在,复用)。
