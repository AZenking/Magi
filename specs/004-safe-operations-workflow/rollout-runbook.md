# Rollout Runbook: Safe Operations Workflow

**Status**: DRAFT — must be reviewed and approved before any shadow or new-write enablement.
**Feature**: `004-safe-operations-workflow` (US1 safe sync/match MVP)

## Purpose

This runbook defines the expand → backfill → shadow → enable → contract switch matrix, data gates, stop conditions, owners and step-by-step rollback for the Safe Operations migration. **No shadow or new-write flag may be created or enabled until this document is reviewed.**

## Migration phases (Parallel Change)

| Phase | State | Gate to next |
|-------|-------|--------------|
| 1. Expand | Schema columns + new tables added (nullable/defaulted) | Migration applied on empty + legacy fixture; T019 tests green |
| 2. Backfill | version=1, lifecycle, sourcePresence, stream position populated deterministically | Backfill re-run is no-op; conflict report reviewed |
| 3. Shadow preview | New diff/match runs as shadow against 10k fixture + prod-shaped data | Old vs new results match (or diffs explained); zero manual-field loss |
| 4. Enable new writes (per source) | One small source uses preview→apply; old delete/recreate path stays for the rest | Preservation + recovery gates pass for the small source |
| 5. Expand to 10k | All sources use new path | 10k preservation/recovery/shadow gates pass |
| 6. Contract cleanup | Old delete/recreate path removed; compatibility columns dropped | Observation period elapsed; T130/T131 gates pass |

## Switch matrix

| Switch | Location | Default | When enabled |
|--------|----------|---------|--------------|
| `SAFE_OPS_SHADOW_PREVIEW` | `docker/.env.example` → `safe-operations.config.ts` (API + Worker) | `false` | Phase 3 |
| `SAFE_OPS_ENABLE_NEW_WRITE_SOURCE_IDS` | same | `""` (empty = none) | Phase 4 (one source id) |
| `SAFE_OPS_ENABLE_NEW_WRITE_ALL` | same | `false` | Phase 5 |

## Data gates (must pass before proceeding)

- **G1 (Expand)**: `pnpm --filter @magi/api db:migrate` succeeds on empty DB AND on legacy fixture; re-run is no-op.
- **G2 (Backfill)**: `version` populated for every row; `lifecycle` derived in precedence (disabled→hidden→active); exactly one primary stream per channel or blocker reported.
- **G3 (Shadow)**: 10k fixture old-vs-new diff: 100% manual fields preserved (SC-001); impact counts 100% accurate (SC-002/SC-010).
- **G4 (Enable)**: Recovery round-trip within 5 min (SC-004); no orphan relations, duplicate side effects, or secret exposure.
- **G5 (Contract)**: 10k shadow + recovery + preservation gates pass for N days observation.

## Stop conditions (halt rollout immediately)

- Incorrect impact count on any operation.
- Any lost manual field (name/group/logo/number/EPG lock/stream order/health).
- Orphan relation (membership/stream/override dangling).
- Duplicate side effect on replay.
- Secret exposure in audit/backup/task/log.
- Failed recovery verification.

## Rollback steps

1. Set `SAFE_OPS_ENABLE_NEW_WRITE_*` back to previous value (empty or smaller source list).
2. Compatibility reads remain active — old path resumes immediately.
3. If a bad apply occurred: restore from the recovery point linked in the task/audit record.
4. If schema issue: the expand migration is additive only — no rollback migration needed; fix forward.

## Current status (2026-07-27)

- **Phase 1 (Expand)**: COMPLETE (T020, 2026-07-27). The legacy migration chain (old 0000–0007) was unrunnable (0000 created an ancient schema; hand-written 0004/0005/0007 altered tables no migration created; snapshots 0001–0007 missing) and no database had ever consumed it (`drizzle.__drizzle_migrations` empty — dev DB was created via `db:push`). Baseline was rebuilt: new `0000_baseline_pre_safe_operations` (pre-safe-ops HEAD schema) + `0001_amazing_xorn` (safe-ops expand DDL + idempotent G2 backfill DML), both produced by `db:generate`. Validated: empty DB migrate + re-run no-op; legacy fixture (hidden/disabled booleans, `merged_from_ids` in all 3 legacy formats, duplicate/missing primary streams, NULL positions) migrate + backfill replay no-op; live `magi` migrated after baseline adoption. T019 gate tests green (5/5).
  - **Baseline adoption for existing push-created DBs**: insert the 0000 journal record (`hash` = sha256 of `0000_baseline_pre_safe_operations.sql`, `created_at` = journal `when` value) into `drizzle.__drizzle_migrations`, then run `pnpm --filter @magi/api db:migrate` — only the 0001 expand executes.
- **Phase 2 (Backfill)**: G2 backfill DML ships inside `0001_amazing_xorn.sql` (lifecycle precedence disabled→hidden→active; `merged_from_ids` → `canonical_channel_members` with `membership_source='migrated'`; deterministic stream positions; unique-primary demote/promote repair; seen-timestamps). All statements verified idempotent (re-run = 0 rows).
- **Foundation code**: complete (T006–T041); API use cases + HTTP + Worker boundary in place.
- **UI integration (T046–T047)**: DEFERRED — source-list-page and epg-matching routes are in the dirty UI migration worktree; integration happens during the UI migration merge to avoid conflicts. The `OperationPreview` component (T045) + queries (T044) are ready to wire.

---

## T129 — Rollout drill log (2026-07-27)

Drill executed against the live `magi-postgres` (port 15432, healthy) and
`magi-redis` (port 16379, healthy). Commands, results and deviations recorded
per wave. Gates G1–G2 verified live; G3–G5 require a seeded dataset + running
service stack and are documented as the next-step handoff.

### Wave 1 — Expand (G1)

**Command:**
```sh
pnpm --filter @magi/api db:migrate
```

**Result — ✅ PASS.**
- `drizzle.__drizzle_migrations` count = **2** (`0000_baseline_pre_safe_operations`,
  `0001_amazing_xorn`).
- All Safe Operations tables present: `operation_change_sets`, `operation_change_items`,
  `operation_leases`, `recovery_points`, `recovery_point_items`, `audit_events`,
  `outbox_events`, `idempotency_records`, `config_backups`, `channel_failover_policies`,
  `scheduled_job_configs`, `canonical_channel_members`, `source_channel_identity_aliases`,
  `source_import_snapshots`, `source_import_snapshot_items`.
- **Idempotency re-run**: re-executing `db:migrate` produced no new migration rows
  (count stays 2; NOTICE `relation "__drizzle_migrations" already exists, skipping`).
  Gate G1 (re-run is no-op) confirmed.

**Gate G1**: ✅ PASS (migration applied on the live DB; re-run idempotent).

### Wave 2 — Backfill (G2)

**Commands (live DB introspection):**
```sh
docker exec magi-postgres psql -U magi -d magi -c \
  "SELECT count(*) FILTER (WHERE version IS NULL) AS null_version, count(*) AS total FROM canonical_channels;"
docker exec magi-postgres psql -U magi -d magi -c \
  "SELECT canonical_channel_id, count(*) FILTER (WHERE is_primary) AS primaries FROM channel_streams GROUP BY canonical_channel_id HAVING count(*) FILTER (WHERE is_primary) <> 1 LIMIT 5;"
docker exec magi-postgres psql -U magi -d magi -c \
  "SELECT count(*) FILTER (WHERE position IS NULL) AS null_positions, count(*) AS total FROM channel_streams;"
```

**Result — ✅ PASS (vacuously, on empty data).**
- The live `magi` DB currently has **0 canonical channels / 0 streams** (clean dev DB,
  no business data seeded yet). Therefore:
  - `null_version` = 0 / total 0 → no row lacks a version.
  - No channel has ≠1 primary stream (no violating rows).
  - `null_positions` = 0 / total 0 → no NULL positions.
- Backfill idempotency was previously validated on the legacy fixture (runbook Phase 2):
  re-run = 0 rows affected. This holds structurally.

**Gate G2**: ✅ PASS on empty DB. To validate on real data, seed via the fixture
(`safe-operations-fixture.ts seed`) against a DB writer, then re-check the three
invariants. **Deviation**: the fixture CLI uses an in-memory writer (process-scoped);
a persistent DB writer integration is the prerequisite for G2-on-data + G3 shadow.

### Wave 3 — Shadow preview (G3) — 🟡 BLOCKED on seeded data + service stack

G3 requires a 10k seeded dataset with old-vs-new diff comparison. Prerequisites
not yet met in this drill:
1. Fixture writer does not persist to the live DB (in-memory only).
2. API + Worker services are not running to drive preview/apply end-to-end.

**Stop-condition check**: none triggered (no data to lose; no apply attempted).

**To complete G3**:
1. Extend the fixture writer to seed the live `magi` DB (or run the API seed).
2. Start API + Worker (`pnpm --filter @magi/api dev` + worker).
3. Toggle `SAFE_OPS_SHADOW_PREVIEW=true`, run M3U/EPG preview on the 10k source.
4. Assert SC-001 (100% manual fields preserved) + SC-002/SC-010 (impact counts accurate).

### Wave 4 — Enable new writes per source (G4) — 🟡 BLOCKED on G3

Requires G3 to pass first. Single small source → preview→apply → recovery round-trip
within 5 min (SC-004). Not attempted (G3 prerequisite unmet).

### Wave 5 — Contract cleanup (G5) — ⛔ DEFERRED (observation period)

T130/T131 are conditional destructive tasks gated on a multi-day observation
period after G3/G4 pass. Correctly deferred per the runbook's Phase 6 gate.

### Drill summary

| Wave | Gate | Status | Evidence |
|------|------|--------|----------|
| 1 Expand | G1 | ✅ PASS | 2 migrations applied; re-run no-op; all tables present |
| 2 Backfill | G2 | ✅ PASS (empty) | 0 null-version, 0 multi-primary, 0 null-position; idempotent |
| 3 Shadow | G3 | 🟡 BLOCKED | needs seeded DB + running services |
| 4 Enable | G4 | 🟡 BLOCKED | needs G3 |
| 5 Contract | G5 | ⛔ DEFERRED | observation-period gate (T130/T131) |

**No stop-conditions triggered.** The rollout is safe at its current state
(expand + backfill applied; new writes not yet enabled). Rollback is trivial:
additive-only schema means no rollback migration is needed; the
`SAFE_OPS_ENABLE_NEW_WRITE_*` switches default to off.

**Next actions to advance G3–G4**:
1. Implement a DB-backed fixture writer (or use the API seed) to populate the
   live `magi` DB with the 10k deterministic dataset.
2. Start the API + Worker services.
3. Run the shadow + enable drill waves and record SC-001/002/004/010 evidence.

## Config files

- `apps/api/src/shared/config/safe-operations.config.ts`
- `apps/worker/src/infrastructure/config/safe-operations.config.ts`
- `docker/.env.example` (switch defaults)

These land after this runbook is reviewed (T048 second clause).
