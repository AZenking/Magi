# Backup, Restore and Recovery Contract

## Create configuration backup

### `POST /backups`

Requires `Idempotency-Key`.

```json
{
  "scope": {
    "sources": true,
    "canonicalChannels": true,
    "epgBindings": true,
    "streams": true,
    "schedules": true,
    "policies": true
  }
}
```

Returns `202` TaskRef and backup resource reference.

Backups default to 30-day retention. Responses expose `expiresAt`; deployment configuration may extend this period.

The manifest contains:

- `formatVersion`;
- `sourceAppVersion`;
- creation timestamp;
- capabilities;
- included scope;
- object counts;
- payload checksum.

Default payload excludes credentials, tokens, cookies, Authorization values, connection strings, task execution logs, stack traces and live health samples.

### `GET /backups`

Paginated backup metadata, status, scope, counts, expiry and download capability.

### `GET /backups/{id}/download`

Allowed only when status is ready and current admin is authorized. Returns attachment; storage reference is never exposed.

Backup bytes are written through `BackupObjectStorage` to a server-private location using a temporary file, checksum/size verification, fsync and atomic rename. Object deletion must succeed before metadata becomes `expired`; transient deletion failures remain retryable.

## Restore preflight

Backup restore uses `POST /operations/previews` with `kind=backup_restore` and a selected uploaded/existing backup ID.

Preflight validates before any operational state changes:

- payload readability and checksum;
- supported format version/capabilities;
- object counts;
- referential integrity;
- missing dependencies;
- add/overwrite/skip/conflict counts;
- redaction rules.

Future major format or unknown required capability is blocked. Supported old formats pass through an explicit sequential migration chain before preview.

Default mode is `replace` for included scope. A future `merge` mode must define conflict behavior as a separate contract and is not part of this feature.

## Apply restore

Change-set apply follows the common operation contract and must:

1. validate preview again;
2. create a recovery point of current affected scope;
3. apply;
4. verify counts, references and checksums;
5. expose rollback capability when verification fails.

Task stages are `validating → checkpointing → applying → verifying`.

## Recovery points

### `GET /recovery-points`

Filters by operation, scope, task and validity.

### `GET /recovery-points/{id}`

Returns metadata, item counts, checksum, expiry, origin task/change set and restore capability. Snapshot payload is not returned in list/detail.

### Restore

Use `POST /operations/previews` with `kind=recovery_restore`. Restore is idempotent: reapplying a completed restore with the same input produces no additional domain changes and returns the original result when the same idempotency key is used.

## Security obligations

- URLs are redacted for userinfo and known credential query parameters.
- Audit and task summaries include counts and field names, not secret values.
- Any integrity, compatibility or checkpoint failure results in zero operational writes.
- Backup round-trip and sensitive-data scans are release gates.
