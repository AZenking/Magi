# Validation Results — 004 Safe Operations Workflow

This document records the green-gate validation evidence for the Safe Operations
Workflow feature. It is updated as each validation phase completes.

## Status: 128/136 tasks complete (94%)

All implementation tasks (T001–T124) and the Web failure tests (T096/T113) are
complete. The remaining 8 tasks are environment-dependent (DB / interactive /
conditional) and tracked below under "Pending validation".

---

## T135 — Full lint / build / test / tsc gate

**Date:** 2026-07-27
**Environment:** macOS (non-interactive, no DB connection)

### TypeScript compilation (`tsc --noEmit`) — ✅ PASS

| Package | Errors |
|---------|--------|
| @magi/types | 0 |
| @magi/backend-core | 0 |
| @magi/api | 0 |
| @magi/worker | 0 |
| @magi/web | 0 |

Command: `pnpm -r --filter @magi/types --filter @magi/backend-core --filter @magi/api --filter @magi/worker --filter @magi/web exec tsc --noEmit`

### Lint — ✅ PASS (0 errors)

| Package | Errors | Warnings |
|---------|--------|----------|
| @magi/api | 0 | 0 |
| @magi/web | 0 | 3 (incidental unused-import) |

Commands: `pnpm --filter @magi/api lint`, `pnpm --filter @magi/web lint`

### Build (`pnpm -r build`) — ✅ PASS

All 5 packages build successfully. Web produces `dist/server/` + client assets.

### Tests — ✅ PASS

| Package | Test Files | Tests (passed / skipped) |
|---------|-----------|--------------------------|
| @magi/backend-core | 3 | 21 / 0 |
| @magi/api | 20 passed, 18 skipped | 191 / 78 |
| @magi/worker | 2 passed, 1 skipped | 6 / 5 |
| @magi/web | 10 | 45 / 13 |
| **Total** | — | **263 passed, 96 skipped** |

Skipped tests are DB-integration / interactive scenarios gated on a live
PostgreSQL instance (T020 migration) — they are marked `.skip` and documented in
each spec file.

### Notes on skipped tests

The 96 skipped tests fall into these categories:
- **Repository integration tests** (T028/T092 etc.) — require a live DB +
  the T020 expand migration.
- **Application use-case integration** (T029–T031, T076–T078, T093–T095) —
  require the DB-backed repositories from T024/T025.
- **HTTP contract tests** (T033, T051, T064, T077, T095, T112) — require
  supertest + a bootstrapped Nest app with DB.
- **BullMQ scheduler** (T078) — requires a Redis instance.
- **Web render-with-data** (part B of T034/T053/T065/T079) — define component
  behavior; part A (fixture) is live.

These unblock once T020 (drizzle introspect against live `magi-postgres`) is
resolved in a TTY session.

---

## Pending validation (environment-dependent)

### T128 — Performance & consistency suite (1k/10k/50k)

**Deterministic core — ✅ PASS** (in-memory writer; no DB writes).

The fixture's deterministic generation + normalized digest is validated at all
three scales. The same seed (4004) yields identical class/lifecycle counts and
a stable digest, confirming cross-run reproducibility.

| Scale | seed time | digest |
|-------|-----------|--------|
| 1,000  | 278ms | 209400a8c282855d |
| 10,000 | 317ms | 209400a8c282855d |
| 50,000 | 484ms | 209400a8c282855d |

10k distribution (release gate, SC-012) — fixed by seed 4004:
```
class:   unchanged=6965 renamed=1052 missingReappear=487 duplicateIdentity=489 missingIdentity=489 multiSourceConflict=518
lifecycle: active=6982 hidden=1318 disabled=969 trashed=731
```

**End-to-end performance (preview/apply/restore latency, queue wait, lock wait,
memory, failure rate) — 🟡 PENDING live stack.**

The in-memory fixture writer does not exercise the HTTP API, BullMQ queue, or
Drizzle repositories. SC-012 ("10k channels preview summary <10s") requires a
running API + Worker + the live `magi-postgres` to measure real preview latency.
The DB and Redis are now running and migrated, so this is unblocked once the
services are started. The fixture CLI's `verify` reports `ok:false` in CLI mode
because each invocation is a fresh process (the InMemoryFixtureWriter does not
persist across `seed` → `verify`); within a single process (tests) it is green.

### T129 — Rollout drill (expand/backfill/shadow/enable/contract)
**Status:** Blocked on DB.
Runs the reviewed `rollout-runbook.md` wave-by-wave with rollback evidence.

### T130 / T131 — Legacy path removal + contract migration
**Status:** Conditional. Blocked on T129 drill + T130 preservation/recovery/shadow
gates + a compatibility observation period. These are intentionally destructive
and must not run before the gates pass.

### T133 — antd lint
**Status:** Blocked. Requires the `antd` CLI (`antd lint apps/web/src --format json`)
which is not installed in this environment. Once installed, run it to detect v6
deprecated APIs, context Modal issues, token/keyboard accessibility, and
constitution 2.2.0 `design.md` visual-language violations (hardcoded colors,
non-token font sizes/weights, off-grid spacing, wrong corner-radius tiers,
custom cubic-bezier, multiple primary buttons per surface, preset palette misuse,
custom CSS bypassing token/algorithm/theme.components/CSS variables).

### T134 — Quickstart 13 scenarios + 20-user usability
**Status:** Interactive. Requires a running stack (DB + API + Worker + Web) and
20 first-time administrators for SC-003/005/006 timed acceptance (≥19/20 pass).

### T136 — Requirements traceability
**Status:** Blocked on T128–T135. Final FR-001–FR-038 / SC-001–SC-012 review.

---

## How to complete the remaining gates

1. **Resolve T020** in a TTY session: `pnpm --filter @magi/api db:generate` +
   `db:migrate` against a live `magi-postgres`.
2. **Unskip + run** the 96 skipped tests against the DB.
3. **Run T128** perf suite; record numbers above.
4. **Run T129** rollout drill; append evidence to `rollout-runbook.md`.
5. **Install antd CLI**, run **T133**, fix violations, write JSON results.
6. **Run T134** quickstart + usability interactively.
7. **Write T136** traceability once T128–T135 evidence exists.
8. **T130/T131** only after the observation period + gates pass.
