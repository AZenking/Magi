# Channel and Stream Contract

## Channel read model

### `GET /output/channels`

Adds filters:

- `lifecycle=active|hidden|disabled|trashed`;
- `sourcePresence=present|missing|conflict`;
- `epgStatus`, `group`, `search`, `page`, `pageSize`.

Default lifecycle is `active`. Hidden, disabled and trash views are first-class, reachable states.

Each item includes:

```json
{
  "id": "uuid",
  "standardName": "CCTV-1",
  "lifecycle": "hidden",
  "lifecycleReason": null,
  "trashedAt": null,
  "purgeAfter": null,
  "sourcePresence": "present",
  "manualEpgLocked": true,
  "primaryStreamId": "uuid",
  "streamCount": 3,
  "version": 8
}
```

Responses include ETag for detail resources.

## Reversible lifecycle transitions

### `POST /output/channels/{id}/lifecycle`

Requires `If-Match`.

```json
{
  "target": "hidden",
  "reason": "Temporarily excluded from customer lineup"
}
```

Allowed transitions:

```text
active ↔ hidden
active ↔ disabled
hidden ↔ disabled
active|hidden|disabled → trashed
trashed → active|hidden|disabled
```

`trashed → purge` is never accepted here; it uses an operation preview.

Response includes previous/current lifecycle, changedAt, purgeAfter and new version.

Batch lifecycle uses `channel_lifecycle_batch` preview with stable channel IDs. Confirmation displays IDs, names and counts, never row indexes.

## Permanent purge

Use `POST /operations/previews` with `kind=channel_purge`. Purge requires channel lifecycle `trashed`, explicit typed acknowledgement and a valid recovery policy decision. Successful purge returns only audit references; it is not reversible through ordinary trash restore.

## Manual EPG binding

### `PATCH /output/channels/{id}/epg-binding`

Requires `If-Match`.

```json
{
  "xmltvSourceId": "uuid",
  "epgChannelId": "channel-id",
  "locked": true,
  "reason": "Operator verified regional feed"
}
```

Clearing binding sends null IDs and explicit `locked=false`. Detail responses include source name, candidate display name, decision source and lock state.

## Stream ordering

### `PUT /output/channels/{id}/streams/order`

Requires channel `If-Match`.

```json
{
  "streams": [
    {
      "id": "stream-a",
      "position": 0,
      "isPrimary": true,
      "eligibleForFailover": true
    },
    {
      "id": "stream-b",
      "position": 1,
      "isPrimary": false,
      "eligibleForFailover": true
    }
  ]
}
```

Rules:

- request lists every active stream exactly once;
- positions are contiguous from 0;
- exactly one primary when list is non-empty;
- all stream IDs belong to the channel.

Deleting the primary requires the request to identify the acknowledged successor; if none exists, acknowledgement confirms output loss.

## Failover policy

### `PUT /output/channels/{id}/failover-policy`

Requires `If-Match`.

```json
{
  "mode": "auto_restore_primary",
  "failureThreshold": 3,
  "recoveryThreshold": 2,
  "cooldownSeconds": 60
}
```

### `POST /output/channels/{channelId}/streams/{streamId}/check`

Requires `Idempotency-Key`; returns `202` TaskRef scoped to that stream. Only the target row displays pending status.

Automatic switch events appear in channel history and audit with old/new stream, health reason and policy version.

## UI obligations

- Lifecycle tabs/filters show counts and allow restore from hidden, disabled and trash.
- Row selection persists stable IDs and visible names across pagination.
- EPG dialog shows XMLTV source, candidate, confidence/reason for automatic results and manual-lock state.
- Stream list exposes drag/order controls, one primary marker, automatic eligibility and per-stream check.
