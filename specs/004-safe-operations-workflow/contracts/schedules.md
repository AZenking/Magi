# Schedule Contract

## Schedule resource

### `GET /tasks/scheduled`

Each resource returns ETag/version:

```json
{
  "id": "m3u-sync-primary",
  "name": "Primary source refresh",
  "description": "Refresh primary M3U source",
  "taskType": "m3u-sync",
  "scope": { "type": "source", "id": "uuid" },
  "enabled": true,
  "schedule": { "type": "interval", "intervalMs": 3600000 },
  "timeZone": "Asia/Shanghai",
  "overlapPolicy": "skip",
  "nextRunAt": "2026-07-26T11:00:00.000Z",
  "lastRunAt": "2026-07-26T10:00:00.000Z",
  "lastStatus": "succeeded",
  "lastSkipReason": null,
  "version": 4
}
```

## Save schedule

### `PATCH /tasks/scheduled/{id}`

Requires `If-Match`.

```json
{
  "enabled": false,
  "schedule": { "type": "interval", "intervalMs": 7200000 },
  "timeZone": "Asia/Shanghai",
  "overlapPolicy": "skip"
}
```

Rules:

- Form field changes do not call this endpoint.
- Save sends one complete validated draft.
- Cancel/reset sends no request and restores last server resource.
- `enabled=false` removes/prevents future queue scheduler instances but preserves configuration/history.
- Current release accepts only `overlapPolicy=skip`; enum remains forward-compatible.

Response returns updated resource, next-run projection, ETag and an audit reference.

## Trigger now

### `POST /tasks/scheduled/{id}/trigger`

Requires `Idempotency-Key`; returns `202` TaskRef.

If the same scope already has an incompatible running operation, return the existing TaskRef with a `deduplicated=true` marker. Scheduled overlap skips are audited with reason `scope-operation-active`; they do not accumulate catch-up jobs.

## Reconciliation

Persistent schedule configuration is authoritative. Queue scheduler state is reconciled from it at startup and after successful saves. Reconciliation differences are logged and exposed as a schedule warning rather than silently changing saved configuration.

## UI obligations

- Edit opens a draft; only Save persists.
- Cancel visibly returns all fields to their saved values.
- Enabled, timezone, overlap policy, last status and next run are visible without entering edit mode.
- Trigger loading is isolated to one schedule.
