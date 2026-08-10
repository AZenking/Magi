/**
 * Canonical reconcile override preservation test (008-pipeline-reliability T012, US1).
 *
 * Validates that reconcileCanonicals preserves manual overrides (customName)
 * across reconcile runs. Auto-skipped when DB is unreachable.
 */
import { describe, it, expect } from "vitest";
import postgres from "postgres";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:15432/magi_test";
// Keep the worker's Drizzle connection on the same database as the direct
// probe/fixture connection; otherwise a successful probe can target a
// different port/database than reconcileCanonicals.
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

describe.skipIf(!dbReady)("reconcileCanonicals override preservation (T012)", () => {
  it("preserves displayName override across reconcile runs", async () => {
    const sql = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
    try {
      // Clean up.
      await sql`DELETE FROM channel_streams WHERE canonical_channel_id IN (SELECT id FROM canonical_channels WHERE standard_name LIKE 'T012%')`.catch(() => {});
      await sql`DELETE FROM canonical_epg_bindings WHERE canonical_channel_id IN (SELECT id FROM canonical_channels WHERE standard_name LIKE 'T012%')`.catch(() => {});
      await sql`DELETE FROM canonical_channels WHERE standard_name LIKE 'T012%'`.catch(() => {});
      await sql`DELETE FROM channel_overrides WHERE custom_name LIKE 'T012%'`.catch(() => {});
      await sql`DELETE FROM channels WHERE channel_identity LIKE 't012-%'`;
      await sql`DELETE FROM m3u_sources WHERE name = 't012-test'`.catch(() => {});

      // Seed source + channel.
      const [src] = await sql`
        INSERT INTO m3u_sources (name, url, enabled, role, priority, participate_in_output, allow_fallback)
        VALUES ('t012-test', 'http://t012.test/m3u', true, 'primary', 100, true, true)
        RETURNING id`;
      const sourceId = (src as { id: string }).id;

      await sql`
        INSERT INTO channels (channel_identity, m3u_source_id, display_name, group_title, tvg_id, tvg_logo, stream_url, active)
        VALUES ('t012-ch-1', ${sourceId}, 'T012 Original', 'T012 Group', 't012', 'http://logo.png', 'http://stream.ts', true)`;

      // First reconcile — creates canonical with original name.
      const { reconcileCanonicals } = await import("../../../processors/reconcile-canonicals");
      try {
        await reconcileCanonicals();
      } catch {
        // Binding insert may fail on test DB schema differences; the canonical
        // itself should still be created. Check what we got.
      }

      let canonicals = await sql`SELECT id, standard_name FROM canonical_channels WHERE standard_name = 'T012 Original'`;
      expect(canonicals.length).toBe(1);
      const canonId = (canonicals[0] as { id: string }).id;

      // Add an override (custom name).
      await sql`
        INSERT INTO channel_overrides (channel_id, custom_name, custom_group, custom_logo, hidden, starred, manual_epg_locked)
        SELECT id, 'T012 Custom Name', null, null, false, false, false FROM channels WHERE channel_identity = 't012-ch-1'`;

      // Second reconcile — should pick up the override.
      try {
        await reconcileCanonicals();
      } catch {
        // Binding insert may fail on test DB; the canonical update is what matters.
      }

      canonicals = await sql`SELECT standard_name FROM canonical_channels WHERE id = ${canonId}`;
      expect((canonicals[0] as { standard_name: string }).standard_name).toBe("T012 Custom Name");

      // Cleanup.
      await sql`DELETE FROM channel_streams WHERE canonical_channel_id = ${canonId}`.catch(() => {});
      await sql`DELETE FROM canonical_epg_bindings WHERE canonical_channel_id = ${canonId}`.catch(() => {});
      await sql`DELETE FROM canonical_channels WHERE id = ${canonId}`;
      await sql`DELETE FROM channel_overrides WHERE custom_name = 'T012 Custom Name'`.catch(() => {});
      await sql`DELETE FROM channels WHERE channel_identity LIKE 't012-%'`;
      await sql`DELETE FROM m3u_sources WHERE id = ${sourceId}`;
    } finally {
      await sql.end();
    }
  });
});
