# 接口契约:开放接口(`/api/open/v1/*`)

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29

> 面向外部消费方(脚本/第三方播放器/Android TV)的只读数据接口。全部 `GET`,经 `ApiKeyGuard` 鉴权,受按 key 限流。
> 完整机器可读规范由代码优先 `@nestjs/swagger` 自动产出至 `/api/open.json`,交互文档在 `/api/docs`。本文件是人读契约摘要。

---

## 鉴权

所有 `/api/open/v1/*` 端点必须携带凭据,二选一:
- `Authorization: Bearer magi_<32>`(推荐)
- `x-api-key: magi_<32>`

未携带 / 无效 / 禁用 / 吊销 / 过期 → `401 application/problem+json`:
```json
{ "type": "...", "title": "未授权", "status": 401,
  "code": "api-key-required" | "api-key-invalid" }
```
> 故意不区分失效原因,防探测(data-model.md)。

## 限流

按 key 维度,默认 `60 req/min`。超出 → `429`:
```json
{ "status": 429, "code": "rate-limit-exceeded", "title": "请求过于频繁" }
```
响应头 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`。

## 响应约定

- 成功包装:`{ "success": true, "data": <T> }`
- 分页:`{ "items": [...], "total": N, "page": P, "pageSize": S, "totalPages": T }`
- 时间:ISO 8601(带时区)
- 频道 `id` 一律以 `magi:{canonicalId}` 形式返回(FR-015)

---

## 端点

### `GET /api/open/v1/groups`

频道分组列表。

**Query**: 无。

**200** → `ApiResponse<OpenGroupVo[]>`:
```jsonc
{ "success": true, "data": [
  { "name": "新闻", "count": 12 },
  { "name": "体育", "count": 8 }
]}
```

---

### `GET /api/open/v1/channels`

对外可见频道分页列表(已隐藏/停用/回收的不返回,FR-011)。

**Query**:

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `page` | int | 1 | ≥1 |
| `pageSize` | int | 50 | 1–100 |
| `group` | string | — | 按分组精确匹配过滤 |
| `search` | string | — | 频道名模糊搜索 |

**200** → `ApiResponse<PaginatedResponse<OpenChannelVo>>`:
```jsonc
{ "success": true, "data": {
  "items": [
    { "id": "magi:abc-123", "name": "CCTV-1", "group": "央视",
      "logo": "https://.../cctv1.png", "channelNumber": 1 }
  ],
  "total": 1, "page": 1, "pageSize": 50, "totalPages": 1
}}
```

---

### `GET /api/open/v1/channels/{id}`

单个频道详情(`id` 为 `magi:{canonicalId}` 或裸 canonicalId 均接受)。**不含 streams/线路**(FR-012)。

**Path**: `id`

**200** → `ApiResponse<OpenChannelVo>`(单对象,同列表项结构)。
**404** → `resource-not-found`(频道不存在或不可见)。

---

### `GET /api/open/v1/epg`

时间窗节目单(仅关联对外可见频道)。

**Query**:

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `from` | ISO 8601 | 是 | 起始时间 |
| `to` | ISO 8601 | 是 | 结束时间;`to - from ≤ 7 天`(FR-014) |
| `group` | string | 否 | 按分组过滤 |
| `channelId` | string | 否 | 单频道(`magi:{id}`) |
| `search` | string | 否 | 节目名搜索 |
| `page` / `pageSize` | int | 否 | 分页,pageSize ≤ 100 |

**200** → `ApiResponse<PaginatedResponse<OpenProgrammeVo>>`:
```jsonc
{ "success": true, "data": {
  "items": [
    { "channelId": "magi:abc-123", "title": "新闻联播",
      "subTitle": null, "startAt": "2026-07-29T19:00:00+08:00",
      "stopAt": "2026-07-29T19:30:00+08:00", "category": "新闻" }
  ],
  "total": 1, "page": 1, "pageSize": 100, "totalPages": 1
}}
```
**400** → `validation-failed`(时间窗超 7 天 / 格式非法 / `from ≥ to`)。

---

## 契约稳定性

- 所有字段当前为产品视图最小集;新增字段为**非破坏性变更**(向后兼容)。
- 移除/重命名字段需走 MAJOR 版本(`/api/open/v2`)。
- 稳定标识 `magi:{canonicalId}` 一经发布不变(FR-015)。
