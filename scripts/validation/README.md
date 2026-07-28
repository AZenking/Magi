# Safe Operations Validation Fixtures

This directory holds the deterministic datasets and failure-injection tooling
for the `004-safe-operations-workflow` feature.

## Files

| File | Task | Purpose |
|------|------|---------|
| `safe-operations-fixture.ts` | T003 | Fixed-seed 1k/10k dataset generator: `seed` / `verify` / `reset`, normalized digest, manual-state assertions. |
| `safe-operations-failure-injection.ts` | T126 _(planned)_ | prepare/recovery/apply/audit/outbox fault injection + replay verification. |
| `safe-operations-secret-scan.ts` | T127 _(planned)_ | backup/audit/task/log secret scanner + test-secret assertions. |

## Quickstart

```bash
# Seed 10k deterministic channels with seed 4004 (the canonical quickstart seed).
pnpm exec tsx scripts/validation/safe-operations-fixture.ts seed --channels 10000 --seed 4004

# Verify the full normalized state matches the expected digest.
pnpm exec tsx scripts/validation/safe-operations-fixture.ts verify --channels 10000 --seed 4004

# Wipe the dataset.
pnpm exec tsx scripts/validation/safe-operations-fixture.ts reset --seed 4004
```

Smoke (1k) and capacity (50k) use the same command with `--channels 1000` /
`--channels 50000`. The 10k dataset is the release gate (SC-012); 1k is a fast
smoke gate; 50k is capacity-evidence only and **must not** weaken the 10k gate.

## 10k distribution (fixed, from `specs/004-safe-operations-workflow/quickstart.md`)

| Class | % | Exercises |
|-------|---|-----------|
| `unchanged` | 70 | Stable-id preservation baseline |
| `renamed` | 10 | Source rename vs. manual override precedence |
| `missingReappear` | 5 | `missing → present` reappearance without ID change |
| `duplicateIdentity` | 5 | Collision ordinal + conflict blocking |
| `missingIdentity` | 5 | Identity-absent conflict reporting |
| `multiSourceConflict` | 5 | Multi-source membership conflict |

Every seeded channel also carries a deterministic subset of manual overrides
(custom name/group/logo/number, manual EPG lock) and a lifecycle
(`active`/`hidden`/`disabled`/`trashed`) so SC-001 (preservation) and US2
(lifecycle) have reproducible populations to assert against.

## Determinism guarantees

- **PRNG**: mulberry32 seeded by `--seed`. No `Math.random()` anywhere in this
  file. Same `(channels, seed)` always produces byte-identical output across
  Node versions and platforms.
- **Digest**: FNV-1a over a stable (alphabetically-keyed) JSON serialization of
  the normalized channel state, sorted by `channelIdentity`. `verify` compares
  the **full** normalized state of every channel, never a sample.
- **Schema coupling**: the fixture targets the current channel/canonical/
  override/stream schema. When Phase 2 (T017/T018) extends the schema with
  `version`/`lifecycle`/operation columns, `NormalizedChannelState` and
  `seed()` are extended in place; the distribution percentages and PRNG stay
  fixed so historical digests remain comparable across the expand/backfill
  migration.

## Persistence boundary

`seed`/`reset`/`verify` go through a `FixtureWriter` port. The default
`InMemoryFixtureWriter` lets the deterministic core run in CI without
PostgreSQL. The DB-backed writer ships with T004
(`apps/api/src/test/database-test-context.ts`) and is what the CLI uses in
full integration runs.

## What this fixture must support (release gates)

- SC-001: 100% of un-overridden manual channel/stream config preserved across
  sync/match — `verify` digest unchanged before vs. after.
- SC-002 / SC-010: impact-preview counts 100% accurate — `classCounts` in the
  digest is the assertion target.
- SC-012: 10k preview summary within 10s — fixture is the input; timing is
  asserted in T128.
- T019 migration tests: same seed re-run after expand/backfill must yield a
  digest that differs only by the newly-populated fields (no identity churn).
