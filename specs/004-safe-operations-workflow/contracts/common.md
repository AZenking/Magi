# Common HTTP Contract

## Scope

Shared rules for every contract in this feature. All schemas must be defined once as strict Zod schemas in `packages/types`; API, Worker payload validation and Web consume the inferred types.

## Authentication and media types

- All management endpoints require the existing authenticated admin session.
- Normal requests/responses use `application/json`.
- Errors use `application/problem+json`.
- Backup downloads use an attachment response after authorization.
- `x-request-id` is accepted or generated and returned on every response.

## Standard success envelope

```json
{
  "success": true,
  "data": {}
}
```

List responses retain the existing pagination envelope and add stable filters in the request URL.

## Version and conditional writes

- Mutable resource responses return `ETag: "<version>"` and include numeric `version`.
- Overwrite, lifecycle, reorder and schedule writes require `If-Match`.
- Missing `If-Match` returns `428 precondition-required`.
- Stale `If-Match` returns `412 stale-resource` with `currentVersion` and `changedFields`.
- Applying a multi-target preview with any version drift returns `409 preview-stale`; nothing is applied.

## Idempotency

The following commands require `Idempotency-Key`:

- change-set apply;
- trigger-now;
- task retry;
- backup creation;
- recovery/restore apply;
- any compatibility endpoint that directly enqueues sync or match during migration.

Rules:

- Same actor + command + key + request fingerprint returns the original response/TaskRef.
- Same key with a different request fingerprint returns `409 idempotency-key-reused`.
- Records default to and remain valid for at least 24 hours; deployment configuration may extend but never shorten this window.

## TaskRef

```json
{
  "id": "uuid",
  "type": "m3u-sync-preview",
  "status": "pending",
  "statusUrl": "/tasks/uuid",
  "scope": { "type": "source", "id": "uuid" },
  "target": {
    "type": "m3u-source",
    "id": "uuid",
    "displayName": "Primary IPTV"
  },
  "submittedAt": "2026-07-26T10:00:00.000Z"
}
```

Accepted background commands return:

- HTTP `202 Accepted`;
- `Location: /tasks/{taskId}`;
- `{ success: true, data: { task, ...relatedRefs } }`.

## Problem Details

```json
{
  "type": "https://magi.local/problems/preview-stale",
  "title": "Preview is stale",
  "status": 409,
  "detail": "The source changed after this preview was prepared.",
  "instance": "/operations/change-sets/uuid/apply",
  "code": "preview-stale",
  "requestId": "request-id",
  "retryable": true,
  "currentVersion": 12,
  "previewId": "uuid",
  "conflicts": []
}
```

Stable error codes:

| Status | Code                             | Meaning                                          |
| ------ | -------------------------------- | ------------------------------------------------ |
| 400    | `invalid-command`                | Request cannot represent the requested operation |
| 401    | `authentication-required`        | No valid admin session                           |
| 404    | `resource-not-found`             | Target does not exist                            |
| 409    | `operation-in-progress`          | A mutually exclusive task already owns the scope |
| 409    | `preview-stale`                  | Input fingerprint or target version changed      |
| 409    | `idempotency-key-reused`         | Same key used for a different request            |
| 409    | `invalid-state-transition`       | Domain state cannot perform requested transition |
| 410    | `preview-expired`                | Preview is no longer applicable                  |
| 410    | `resource-purged`                | Trashed resource has been permanently removed    |
| 412    | `stale-resource`                 | If-Match failed                                  |
| 422    | `validation-failed`              | Field or domain validation failed                |
| 428    | `precondition-required`          | If-Match missing                                 |
| 503    | `operation-capacity-unavailable` | Operation cannot be safely accepted now          |

Frontends branch on `code`, never parse `detail`.

## Operational read models

### `GET /dashboard/operations-summary`

Returns:

- latest successful M3U/XMLTV sync timestamps;
- latest stream check;
- EPG and tvg-id coverage;
- stream availability;
- running/failed task counts;
- stale source and actionable issue cards.

Each issue contains `actionUrl` with server-approved filters.

### Source effective policy

Source list/detail responses add:

```json
{
  "version": 7,
  "freshnessThresholdMinutes": 1440,
  "readiness": {
    "canSync": true,
    "canMatch": false,
    "blockerCodes": ["xmltv-data-stale"]
  },
  "effectivePolicy": {
    "enabled": true,
    "participatesInOutput": true,
    "role": "primary",
    "priority": 100,
    "fallbackAllowed": true,
    "summary": "Primary output source; preferred over lower priorities; eligible as fallback."
  }
}
```

The Web form explains that higher priority wins, how enabled/output/fallback interact, and previews the effective policy before Save.

### `GET /audit-events`

Filters: `page`, `pageSize`, `action`, `result`, `targetType`, `targetId`, `taskId`, `from`, `to`.

Audit detail never returns credentials, raw Authorization data or unredacted source URLs.

### UI obligations

- Header displays running/failed task summary and polls only while work is active.
- Issue cards navigate in no more than three interactions to the affected object and repair action.
- Loading indicators bind to task/target IDs, not one shared mutation flag.
- Empty source/EPG states link directly to the missing prerequisite action.
