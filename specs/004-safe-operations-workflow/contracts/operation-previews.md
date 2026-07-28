# Operation Preview and Apply Contract

## Operation kinds

```text
m3u_sync
epg_match
source_delete
channel_lifecycle_batch
channel_purge
backup_restore
recovery_restore
```

Operation-specific input is a strict discriminated union. Every request contains `kind`, `scope`, target parameters and current resource versions.

## Create preview

### `POST /operations/previews`

Example request:

```json
{
  "kind": "epg_match",
  "scope": { "type": "xmltv-source", "id": "uuid" },
  "parameters": {
    "sourceId": "uuid",
    "preserveManual": true
  },
  "expectedVersions": {
    "source:uuid": 7
  }
}
```

Response `202`:

```json
{
  "success": true,
  "data": {
    "changeSet": {
      "id": "uuid",
      "kind": "epg_match",
      "status": "preparing",
      "expiresAt": "2026-07-27T10:00:00.000Z",
      "version": 1
    },
    "task": { "id": "uuid", "statusUrl": "/tasks/uuid" }
  }
}
```

Preview generation is side-effect free with respect to current output. It may persist the preview itself and parser evidence scoped to the change set.
Change sets and their source snapshots default to 24-hour retention. `expiresAt` is fixed when the preview is created; apply after that instant is rejected and cleanup waits until no active task or recovery/audit reference requires the records.

## Read preview

### `GET /operations/change-sets/{id}`

Returns ETag and:

```json
{
  "id": "uuid",
  "kind": "epg_match",
  "status": "ready",
  "operationFingerprint": "sha256:...",
  "summary": {
    "added": 0,
    "updated": 7200,
    "missing": 0,
    "deleted": 0,
    "preserved": 2500,
    "conflicts": 300,
    "unmatched": 200
  },
  "warnings": [],
  "blockers": [],
  "expiresAt": "2026-07-27T10:00:00.000Z",
  "version": 4
}
```

### `GET /operations/change-sets/{id}/items`

Filters: `page`, `pageSize`, `classification`, `action`, `selected`, `search`.

Items have stable IDs and ordering. EPG items additionally expose candidate display data, confidence, reason code and current manual lock.

## Record decisions

### `PATCH /operations/change-sets/{id}/items`

Requires `If-Match` on change-set version.

```json
{
  "decisions": [
    {
      "itemId": "uuid",
      "selected": true,
      "candidateId": "xmltv-channel-id",
      "lockManualDecision": true
    }
  ]
}
```

Only a `ready` change set accepts decisions. Conflict items require a valid decision before selection. Response returns the updated summary, blockers and ETag.

## Apply preview

### `POST /operations/change-sets/{id}/apply`

Requires `Idempotency-Key` and `If-Match`.

```json
{
  "confirmedWarningCodes": ["source-items-will-be-marked-missing"],
  "operatorReason": "Reviewed source refresh for July"
}
```

Response `202` contains TaskRef and future recovery-point link. The server:

1. verifies ready/not expired;
2. verifies input fingerprint and every base version;
3. verifies warnings and blockers;
4. acquires the operation scope lease;
5. creates and verifies a recovery point;
6. applies selected items;
7. verifies postconditions;
8. writes result summary and audit event.

No partial apply is exposed as success. Failure keeps the recovery point and returns a retry/recovery capability through the task.

## Cancel or expire

### `POST /operations/change-sets/{id}/cancel`

Requires `If-Match`; allowed only in `preparing` or `ready`. Cancelling preview preparation requests task cancellation when supported.

Expired/stale previews are immutable and must be regenerated.

## Operation-specific blockers

| Kind             | Blockers                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| m3u_sync         | source disabled, download invalid, duplicate stable identity unresolved, existing operation lease |
| epg_match        | source disabled/failed/empty/stale, unresolved selected conflict, existing operation lease        |
| source_delete    | recovery point unavailable, scope operation active                                                |
| channel_purge    | channel not trashed, retention/confirmation unmet, related operation active                       |
| backup_restore   | checksum/format/capability/reference failure, recovery point unavailable                          |
| recovery_restore | recovery point invalid/expired, target versions incompatible                                      |

## Operation-specific impact obligations

- `m3u_sync`: summary/items distinguish add, update, missing, unchanged, identity conflict and preserved manual state.
- `epg_match`: summary/items distinguish exact, fuzzy, conflict and unmatched, and show which locked manual bindings are preserved.
- `source_delete`: summary includes raw/source channels, programmes, EPG mappings, canonical memberships, output streams and schedules; response includes a reversible `disableSource` alternative.
- `channel_lifecycle_batch`: confirmation lists stable IDs, names, current state and target state.
- `channel_purge`: preview names every relationship that becomes unrecoverable and requires typed acknowledgement.
- `backup_restore` / `recovery_restore`: summary distinguishes add, overwrite, skip, conflict and unsupported references.

## UI obligations

- Preview uses a full controlled page or modal with summary, warnings, blockers and paged details.
- The primary action is disabled until blockers are zero and required warnings are acknowledged.
- Applying never optimistically mutates channel/source data; affected targets show task badges until refetch.
- Empty EPG source states provide direct add/sync actions.
