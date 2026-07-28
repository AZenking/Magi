# Task Contract

## Status vocabulary

Wire status is:

```text
pending | running | succeeded | failed | cancelled
```

During migration, existing `success` values are mapped to `succeeded` at the contract boundary.

## Task detail

### `GET /tasks/{id}`

```json
{
  "id": "uuid",
  "type": "epg-match-apply",
  "status": "running",
  "stage": "applying",
  "scope": { "type": "source", "id": "uuid" },
  "target": {
    "type": "xmltv-source",
    "id": "uuid",
    "displayName": "Daily EPG"
  },
  "initiator": { "type": "user", "id": "admin-id" },
  "progress": {
    "current": 4500,
    "total": 10000,
    "percent": 45,
    "message": "Applying approved matches"
  },
  "capabilities": {
    "canCancel": false,
    "canRetry": false,
    "canRestore": false
  },
  "relations": {
    "parentTaskId": null,
    "rootTaskId": "uuid",
    "changeSetId": "uuid",
    "recoveryPointId": "uuid"
  },
  "result": null,
  "error": null,
  "submittedAt": "2026-07-26T10:00:00.000Z",
  "startedAt": "2026-07-26T10:00:01.000Z",
  "finishedAt": null
}
```

Task errors use the same Problem Details shape, redacted for display. Raw stack traces remain restricted to diagnostic views and never contain known sensitive fields.

## List and summary

### `GET /tasks`

Adds filters `scopeType`, `scopeId`, `targetType`, `targetId`, `rootTaskId` while retaining existing status/type/queue pagination.

### `GET /tasks/summary`

Returns compact running, failed and recently completed tasks for the global Header:

```json
{
  "runningCount": 2,
  "failedCount": 1,
  "items": []
}
```

## Cancellation

### `POST /tasks/{id}/cancel`

Requires `Idempotency-Key`.

- Capability determines whether cancellation is available.
- A queued task may be cancelled immediately.
- A running task may expose `canCancel=true` only at safe checkpoints.
- A task in the atomic `applying` commit stage always exposes `canCancel=false`; the UI explains that commit is in progress.
- If task completes before cancellation is accepted, response returns final task rather than falsely reporting cancelled.

## Retry

### `POST /tasks/{id}/retry`

Requires `Idempotency-Key`.

- Only failed/cancelled retryable tasks accept retry.
- Retry creates a new task with the same root, parent set to prior attempt and a fresh task ID.
- Same key returns the same retry task.
- Retry reuses immutable input/change set only when still valid; otherwise returns `409 preview-stale`.

## Polling obligations

- Task detail: 2 seconds while pending/running, stop on terminal state.
- Summary: 5 seconds while any task is active, slower or stopped when idle.
- Refetch on window focus.
- Terminal result invalidates only related target collections and dashboard summaries.
- Each row/task badge keys by task ID and target; unrelated rows never show pending.
