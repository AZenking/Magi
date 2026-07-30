# 接口契约:API Key 管理(`/api/admin/api-keys/*`)

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29

> 面向**后台管理员**的凭据管理接口。全部经现有 `AuthGuard`(better-auth session cookie)鉴权 —— 与开放接口的 `ApiKeyGuard` **物理隔离**(FR-019)。每笔变更走 `AppendAuditEventUseCase` 审计(FR-005)。

---

## 鉴权

需要有效管理员 session cookie(与现有 `/dashboard/*`、`/output/*` 一致)。**API key 凭据无法访问本组接口**(反向隔离验证项)。

---

## 端点

### `GET /api/admin/api-keys`

凭据列表(**不含明文**,FR-003)。

**Query**: `page` / `pageSize` / `status?`(active|disabled|revoked) / `search?`(按名称)

**200** → `ApiResponse<PaginatedResponse<ApiKeyVo>>`:
```jsonc
{ "success": true, "data": {
  "items": [
    { "id": "uuid", "name": "客厅电视", "keyPrefix": "magi_3f9…",
      "status": "active", "expiresAt": null,
      "lastUsedAt": "2026-07-29T10:00:00Z",
      "createdBy": "admin-uuid", "createdAt": "2026-07-28T08:00:00Z" }
  ],
  "total": 1, "page": 1, "pageSize": 20, "totalPages": 1
}}
```

---

### `POST /api/admin/api-keys`

创建凭据。**明文仅此次响应返回**(FR-001),后续不可再取。

**Body**(Zod 校验):
```jsonc
{ "name": "客厅电视", "expiresAt": null }   // name 1-120 字;expiresAt 可选 ISO 8601
```

**201** → `ApiResponse<ApiKeyCreatedVo>`(比列表多 `key` 明文字段):
```jsonc
{ "success": true, "data": {
  "id": "uuid", "name": "客厅电视", "key": "magi_<32base62>",   // ← 明文,仅此一次
  "keyPrefix": "magi_3f9…", "status": "active",
  "expiresAt": null, "createdAt": "2026-07-29T..."
}}
```

> 客户端(web)**必须**在此时引导用户复制保存;关闭弹窗后明文即不可见(US1-AC1/AC2)。

**审计**: `api_key.created`。

---

### `POST /api/admin/api-keys/{id}/disable`

禁用(可逆)。**200** → `ApiResponse<ApiKeyVo>`(status=`disabled`)。审计 `api_key.disabled`。

### `POST /api/admin/api-keys/{id}/enable`

启用(仅 disabled 可启用;revoked 不可逆)。**200** → `ApiResponse<ApiKeyVo>`(status=`active`)。
**409** → `invalid-state-transition`(目标非 disabled)。审计 `api_key.enabled`。

### `POST /api/admin/api-keys/{id}/revoke`

永久吊销(终态,不可逆,FR-004/US5)。**200** → `ApiResponse<ApiKeyVo>`(status=`revoked`)。
审计 `api_key.revoked`。吊销后使用该 key 的客户端**下次请求即被拒**(US5-AC1)。

### `DELETE /api/admin/api-keys/{id}`

物理删除(行移除,无论当前状态)。**200** → `ApiResponse<null>`。
审计 `api_key.deleted`。已删除的 key 再被使用 → 401 `api-key-invalid`。

---

## 状态机(见 data-model.md)

```
active ⇄ disabled → revoked(终态) → deleted(行移除)
```

非法转换(如 `revoked → active`、`active → active`)→ `409 invalid-state-transition`。

---

## 错误码(沿用现有 ProblemDetailsFilter)

| code | HTTP | 场景 |
|---|---|---|
| `validation-failed` | 400 | body/query 校验失败 |
| `authentication-required` | 401 | 未登录 |
| `resource-not-found` | 404 | key id 不存在 |
| `invalid-state-transition` | 409 | 非法状态切换 |
