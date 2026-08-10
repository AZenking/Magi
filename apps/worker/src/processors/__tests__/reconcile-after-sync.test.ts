/**
 * reconcileCanonicals integration test (008-pipeline-reliability T011, US1).
 *
 * Validates that calling reconcileCanonicals() after M3U sync generates
 * canonical_channels and channel_streams — even without an EPG match.
 *
 * Uses the worker's own db connection (DATABASE_URL). Auto-skipped when
 * the DB is unreachable.
 */
import { describe, it, expect } from "vitest";
import postgres from "postgres";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:15432/magi_test";
// Keep the worker's Drizzle connection on the same database as the direct
// probe/fixture connection. Without this, the fallback probe can pass on the
// test port while reconcile opens the application default database instead.
process.env.DATABASE_URL ??= TEST_DB_URL;

const dbReady = await (async () => {
  const probe = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
  try {
    await probe`SELECT 1`;
    const rows = await probe`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'canonical_channels' AND column_name = 'standard_name')
         OR (table_name = 'channel_streams' AND column_name IN ('missing_since', 'purged_at', 'version'))`;
    const columns = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    return [
      'canonical_channels.standard_name',
      'channel_streams.missing_since',
      'channel_streams.purged_at',
      'channel_streams.version',
    ].every((column) => columns.has(column));
  } catch {
    return false;
  } finally {
    await probe.end();
  }
})();

describe.skipIf(!dbReady)("reconcileCanonicals (T011)", () => {
  it("generates canonical channels and streams from channels table data", async () => {
    const sql = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
    try {
      // Clean up any prior test data.
      await sql`DELETE FROM channel_streams WHERE canonical_channel_id IN (SELECT id FROM canonical_channels WHERE standard_name LIKE 'T011%')`;
      await sql`DELETE FROM canonical_epg_bindings WHERE canonical_channel_id IN (SELECT id FROM canonical_channels WHERE standard_name LIKE 'T011%')`;
      await sql`DELETE FROM canonical_channels WHERE standard_name LIKE 'T011%'`;
      await sql`DELETE FROM channels WHERE channel_identity LIKE 't011-%'`;
      await sql`DELETE FROM m3u_sources WHERE name = 't011-test'`.catch(() => {});

      // Seed a minimal M3U source + channels row.
      const [src] = await sql`
        INSERT INTO m3u_sources (name, url, enabled, role, priority, participate_in_output, allow_fallback)
        VALUES ('t011-test', 'http://t011.test/m3u', true, 'primary', 100, true, true)
        RETURNING id`;
      const sourceId = (src as { id: string }).id;

      await sql`
        INSERT INTO channels (channel_identity, m3u_source_id, display_name, group_title, tvg_id, tvg_logo, stream_url, active)
        VALUES ('t011-ch-1', ${sourceId}, 'T011 Channel', 'T011 Group', 't011', 'http://logo.png', 'http://stream.ts', true)`;

      // Run reconcile.
      const { reconcileCanonicals } = await import("../reconcile-canonicals");
      await reconcileCanonicals();

      // Verify canonical was created.
      const canonicals = await sql`
        SELECT id, standard_name, standard_group, output_status
        FROM canonical_channels
        WHERE standard_name = 'T011 Channel'`;

      expect(canonicals.length).toBeGreaterThan(0);
      const canon = canonicals[0] as { id: string; standard_name: string; output_status: string };
      expect(canon.standard_name).toBe("T011 Channel");
      expect(canon.output_status).toBe("active");

      // Verify stream was created.
      const streams = await sql`
        SELECT id, stream_url, is_primary
        FROM channel_streams
        WHERE canonical_channel_id = ${canon.id}`;
      expect(streams.length).toBeGreaterThan(0);
      expect((streams[0] as { stream_url: string }).stream_url).toBe("http://stream.ts");

      // Cleanup.
      await sql`DELETE FROM channel_streams WHERE canonical_channel_id = ${canon.id}`;
      await sql`DELETE FROM canonical_epg_bindings WHERE canonical_channel_id = ${canon.id}`;
      await sql`DELETE FROM canonical_channels WHERE id = ${canon.id}`;
      await sql`DELETE FROM channels WHERE channel_identity LIKE 't011-%'`;
      await sql`DELETE FROM m3u_sources WHERE id = ${sourceId}`;
    } finally {
      await sql.end();
    }
  });
});
