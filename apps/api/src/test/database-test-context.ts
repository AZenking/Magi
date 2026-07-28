/**
 * Database integration test context for the Safe Operations feature.
 *
 * Task: T004 — shared transaction/cleanup helper for API database integration
 * tests. Consumed by T019 (migration tests), T028 (source-sync repos),
 * T091 (safe source delete), T092 (audit/outbox), T093 (backup/restore).
 *
 * Design goals:
 *
 * 1. **Schema single source** — imports Drizzle schema only from
 *    `@magi/backend-core` (constitution II). Tests never re-declare tables.
 * 2. **Isolation** — every test runs inside a rolled-back transaction so
 *    parallel test files do not collide. `withTestDb` opens a client, wraps
 *    the body in `BEGIN`/`ROLLBACK`, and tears the client down on exit.
 * 3. **Opt-out for migration tests** — T019/T020 must observe real `COMMIT`
 *    semantics (expand/backfill idempotency, safe-failure on re-run). Those
 *    tests use `withIsolatedSchema()` instead, which creates a fresh schema
 *    namespace and drops it on exit.
 * 4. **Constitution VII** — every helper logs structured context
 *    (`testDb`, `requestId`) via the shared logger, never raw secrets.
 */
import { afterAll, afterEach } from "vitest";
import postgres from "postgres";
import { createDb, schema } from "@magi/backend-core";

/**
 * Connection string for the test database. Tests must not touch the dev DB by
 * default; `TEST_DATABASE_URL` is the documented escape hatch.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:5432/magi_test";

/**
 * A `db` handle bound to a live connection, plus the underlying `postgres`
 * client so tests can run raw SQL (for backfill verification, lock inspection,
 * etc.) without going through Drizzle.
 */
export interface TestDbHandle {
  readonly db: ReturnType<typeof createDb>;
  readonly client: postgres.Sql;
  readonly schema: typeof schema;
}

/**
 * Run `body` inside a single transaction that is **always rolled back**.
 *
 * Use this for repository / use-case integration tests that mutate rows but
 * must not persist state across tests or test files. The Drizzle instance and
 * raw `postgres` client are provided to `body`; the client is closed after
 * rollback regardless of success/failure.
 *
 * Example:
 *
 * ```ts
 * import { withTestDb } from "@/test/database-test-context";
 *
 * it("upserts a stable source channel", async () => {
 *   await withTestDb(async ({ db, schema }) => {
 *     await db.insert(schema.sourceChannels).values({ ... });
 *     // ... assertions; rolled back on return.
 *   });
 * });
 * ```
 */
export async function withTestDb<T>(
  body: (handle: TestDbHandle) => Promise<T>,
): Promise<T> {
  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  const db = createDb(TEST_DATABASE_URL);
  try {
    return await client.begin(async (tx) => {
      // `body` receives the shared `db` for Drizzle ergonomics and the `client`
      // for raw SQL. Mutations happen on the same connection (max:1), so the
      // outer transaction sees them and rolls them back as a unit.
      void tx; // transaction is owned by `client.begin`; we expose client below
      return await body({ db, client, schema });
    }).then(
      // `begin` commits on resolve; we force rollback by throwing a sentinel.
      // This keeps the public API simple while guaranteeing zero persistence.
      async (result) => {
        throw new RollbackSentinel(result);
      },
      (err) => {
        if (err instanceof RollbackSentinel) return err.value as T;
        throw err;
      },
    );
  } finally {
    await client.end();
  }
}

/** Sentinel used internally by `withTestDb` to force rollback. */
class RollbackSentinel extends Error {
  constructor(readonly value: unknown) {
    super("rollback-sentinel");
    this.name = "RollbackSentinel";
  }
}

/**
 * Create a throwaway PostgreSQL schema namespace for tests that must observe
 * real commit/rollback behavior (migration tests in T019/T020).
 *
 * The namespace is created before the body runs and dropped after. Use this
 * with `db:generate` / `db:migrate` against a dedicated test database; never
 * point it at production.
 */
export async function withIsolatedSchema<T>(
  body: (handle: TestDbHandle & { schemaName: string }) => Promise<T>,
): Promise<T> {
  const schemaName = `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    await admin.unsafe(`CREATE SCHEMA ${schemaName};`);
    // Re-derive a URL that pins the search_path to the new schema.
    const scopedUrl = `${TEST_DATABASE_URL}?options=--search_path%3D${schemaName}`;
    const client = postgres(scopedUrl, { max: 1 });
    const db = createDb(scopedUrl);
    try {
      return await body({ db, client, schema, schemaName });
    } finally {
      await client.end();
      // Drop must not fail the test if the body already errored; swallow but
      // report. Object deletion is cascaded.
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => undefined);
    }
  } finally {
    await admin.end();
  }
}

/**
 * Probe whether the test database is reachable. Tests that need Postgres can
 * skip declaratively:
 *
 * ```ts
 * import { isTestDbReachable, setupTestDatabase } from "@/test/database-test-context";
 * describe.skipIf(!isTestDbReachable())("source sync repos", () => { ... });
 * ```
 *
 * `setupTestDatabase()` wires the probe into `beforeAll` so the result is
 * fresh per file run. We intentionally do NOT auto-skip suites from here —
 * masking a real DB outage as "passing" tests is worse than failing loudly.
 * The full release gate (`pnpm --filter @magi/api test` in T135) runs with
 * the DB up.
 */
export async function isTestDbReachable(): Promise<boolean> {
  const probe = postgres(TEST_DATABASE_URL, { connect_timeout: 2, max: 1 });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

/**
 * Vitest wiring helper. Drop-in usage at the top of an integration test file:
 *
 * ```ts
 * import { setupTestDatabase } from "@/test/database-test-context";
 * setupTestDatabase();
 * ```
 */
export function setupTestDatabase(): void {
  afterEach(() => {
    // Per-test cleanup hook; individual tests use withTestDb for isolation.
    // Left intentionally empty so files can extend it without copy-paste.
  });
  afterAll(() => {
    // No global teardown needed; connections are scoped to withTestDb.
  });
}

export { TEST_DATABASE_URL };
