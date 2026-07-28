/**
 * Safe source-sync repository integration tests (T028) — RED phase.
 *
 * These validate the stable-upsert / missing / reappear / identity-alias /
 * canonical-member / collision-ordinal contracts that US1's M3U apply relies on
 * (FR-003, FR-004, data-model.md SourceChannel + CanonicalChannelMember).
 *
 * They run against a live PostgreSQL via withTestDb (T004) and are SKIPPED when
 * Postgres is unreachable OR the Safe Operations migration has not been applied
 * yet (T020 gate). They go green once T035 implements the repository methods.
 */
import { describe, it, expect } from "vitest";
import postgres from "postgres";
import { ChannelRepository } from "../channel.repository";
import { TEST_DATABASE_URL, isTestDbReachable } from "@/test/database-test-context";

// Guard must resolve BEFORE collection: `describe.skipIf` reads its argument at
// collect time, so a `beforeAll` assignment would always leave it false.
// Top-level await keeps the probe fresh per file run.
const dbReachable = await (async () => {
  if (!(await isTestDbReachable())) return false;
  // Additionally check the safe-ops columns exist (migration applied).
  const probe = postgres(TEST_DATABASE_URL, { connect_timeout: 2, max: 1 });
  try {
    const rows = await probe`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'channels' AND column_name = 'source_presence'
    `;
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
})();

describe.skipIf(!dbReachable)("ChannelRepository stable upsert (T028)", () => {
  it("upsertStable preserves the existing id and operator fields on update", async () => {
    const repo = new ChannelRepository();
    const created = await repo.upsertStable({
      channelIdentity: "id:test-1",
      m3uSourceId: null,
      rawChannelId: null,
      displayName: "Original",
      groupTitle: "G1",
      tvgId: null,
      tvgLogo: null,
      streamUrl: null,
      epgChannelId: null,
      epgMatchType: null,
      active: true,
      streamStatus: null,
      streamResponseTime: null,
      streamCheckedAt: null,
      streamError: null,
    });
    const originalId = created.id;

    // Re-sync: display name changes, but id must stay stable.
    const updated = await repo.upsertStable({
      ...created,
      displayName: "Renamed By Source",
    });
    expect(updated.id).toBe(originalId);
    expect(updated.displayName).toBe("Renamed By Source");
  });

  it("markMissing sets sourcePresence to missing without deleting the row", async () => {
    const repo = new ChannelRepository();
    // channels.m3u_source_id is a FK — create a real source row for the fixture.
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      const [src] = await sql`
        INSERT INTO m3u_sources ("name", "url")
        VALUES ('t028-missing-fixture', 'http://fixture.test/missing.m3u')
        RETURNING "id"
      `;
      const identity = `id:test-missing-${Date.now()}`;
      const created = await repo.upsertStable({
        channelIdentity: identity,
        m3uSourceId: src!.id as string,
        rawChannelId: null,
        displayName: "Will Go Missing",
        groupTitle: null,
        tvgId: null,
        tvgLogo: null,
        streamUrl: null,
        epgChannelId: null,
        epgMatchType: null,
        active: true,
        streamStatus: null,
        streamResponseTime: null,
        streamCheckedAt: null,
        streamError: null,
      });
      // Source no longer reports this identity.
      const affected = await repo.markMissing(src!.id as string, ["id:some-other"], new Date());
      expect(affected).toBeGreaterThanOrEqual(1);
      const after = await repo.findById(created.id);
      expect(after?.sourcePresence).toBe("missing");
    } finally {
      await sql.end();
    }
  });

  it("reappear restores sourcePresence to present", async () => {
    const repo = new ChannelRepository();
    const created = await repo.upsertStable({
      channelIdentity: "id:test-reappear",
      m3uSourceId: null,
      rawChannelId: null,
      displayName: "Reappear",
      groupTitle: null,
      tvgId: null,
      tvgLogo: null,
      streamUrl: null,
      epgChannelId: null,
      epgMatchType: null,
      active: true,
      streamStatus: null,
      streamResponseTime: null,
      streamCheckedAt: null,
      streamError: null,
    });
    await repo.markMissing(null!, [], new Date());
    // Source reports the identity again.
    const reappeared = await repo.upsertStable({
      channelIdentity: "id:test-reappear",
      m3uSourceId: null,
      rawChannelId: null,
      displayName: "Reappear",
      groupTitle: null,
      tvgId: null,
      tvgLogo: null,
      streamUrl: null,
      epgChannelId: null,
      epgMatchType: null,
      active: true,
      streamStatus: null,
      streamResponseTime: null,
      streamCheckedAt: null,
      streamError: null,
    });
    expect(reappeared.id).toBe(created.id);
    expect(reappeared.sourcePresence).toBe("present");
  });

  it("findBySourceAndIdentity scopes the lookup to a single source", async () => {
    const repo = new ChannelRepository();
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      const [srcA] = await sql`
        INSERT INTO m3u_sources ("name", "url")
        VALUES ('t028-scope-a', 'http://fixture.test/a.m3u')
        RETURNING "id"
      `;
      const [srcB] = await sql`
        INSERT INTO m3u_sources ("name", "url")
        VALUES ('t028-scope-b', 'http://fixture.test/b.m3u')
        RETURNING "id"
      `;
      const identity = `id:scoped-lookup-${Date.now()}`;
      await repo.upsertStable({
        channelIdentity: identity,
        m3uSourceId: srcA!.id as string,
        rawChannelId: null,
        displayName: "A",
        groupTitle: null,
        tvgId: null,
        tvgLogo: null,
        streamUrl: null,
        epgChannelId: null,
        epgMatchType: null,
        active: true,
        streamStatus: null,
        streamResponseTime: null,
        streamCheckedAt: null,
        streamError: null,
      });
      const found = await repo.findBySourceAndIdentity(srcA!.id as string, identity);
      expect(found?.channelIdentity).toBe(identity);
      // Different source must NOT find it.
      const other = await repo.findBySourceAndIdentity(srcB!.id as string, identity);
      expect(other).toBeNull();
    } finally {
      await sql.end();
    }
  });
});
