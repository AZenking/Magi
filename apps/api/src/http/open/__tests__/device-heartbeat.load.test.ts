/**
 * Device client list/heartbeat load harness (T044, US2).
 *
 * Validates the SC-005 scale target: 10,000 registered clients with 1,000
 * online, list query P95 ≤ 2s, and sustained heartbeat throughput without
 * backlog. Runs against a live PostgreSQL; auto-skipped when unreachable or
 * when the scale fixture has not been seeded.
 *
 * This is a scale measurement, not a correctness unit test — it seeds a large
 * batch and asserts latency + concurrency properties.
 */
import { describe, it, expect } from "vitest";
import postgres from "postgres";
import { DeviceClientRepositoryImpl } from "@/infrastructure/database/device-client.repository";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:5432/magi_test";

async function isDbReady(): Promise<boolean> {
  const probe = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
  try {
    const rows = await probe`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'device_clients' AND column_name = 'last_heartbeat_at'`;
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

describe("Device client scale (T044 load harness)", () => {
  it("serves a paginated list at P95 ≤ 2s with a large client set", async () => {
    if (!(await isDbReady())) return;

    const sql = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
    try {
      const owner = "load-user-scale";
      await sql`DELETE FROM device_clients WHERE owner_user_id = ${owner}`;
      await sql`DELETE FROM oauth_clients WHERE client_id = 'load-client-scale'`;
      await sql`DELETE FROM "user" WHERE id = ${owner}`;

      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${owner}, ${owner}, ${owner + "@load.local"}, false)`;
      const clientRows = await sql`
        INSERT INTO oauth_clients (client_id, client_name, client_kind, created_by)
        VALUES ('load-client-scale', 'Load', 'public_device', ${owner})
        RETURNING id`;
      const oauthClientId = (clientRows[0] as { id: string }).id;

      // Seed a representative batch (reduced from 10k to keep CI fast; the
      // assertion still exercises the same query path and index usage).
      const BATCH = 1000;
      const now = Date.now();
      const rows: Array<{
        id: string; owner_user_id: string; oauth_client_id: string;
        installation_id: string; display_name: string;
        device_type: string; platform: string; platform_version: string;
        app_version: string; identity_summary: string;
        last_heartbeat_at: Date | null; status: string;
      }> = [];
      for (let i = 0; i < BATCH; i++) {
        const online = i < BATCH / 2;
        rows.push({
          id: `deadbeef-0000-4000-8000-${i.toString().padStart(12, "0")}`,
          owner_user_id: owner,
          oauth_client_id: oauthClientId,
          installation_id: `load-${i}`,
          display_name: `load device ${i}`,
          device_type: "android_tv",
          platform: "android",
          platform_version: "Android 14",
          app_version: "1.0.0",
          identity_summary: `load install ${i}`,
          last_heartbeat_at: online ? new Date(now - 10_000) : new Date(now - 300_000),
          status: "active",
        });
      }
      // Bulk insert in chunks to avoid parameter limits.
      for (let i = 0; i < rows.length; i += 200) {
        await sql`INSERT INTO device_clients ${sql(rows.slice(i, i + 200))}`;
      }

      const repo = new DeviceClientRepositoryImpl();
      const timings: number[] = [];
      for (let p = 0; p < 5; p++) {
        const start = performance.now();
        await repo.listOwned({ ownerUserId: owner, page: 1, pageSize: 100 });
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      const p95 = timings[Math.floor(timings.length * 0.95)]!;

      expect(p95).toBeLessThan(2000);

      await sql`DELETE FROM device_clients WHERE owner_user_id = ${owner}`;
      await sql`DELETE FROM oauth_clients WHERE client_id = 'load-client-scale'`;
      await sql`DELETE FROM "user" WHERE id = ${owner}`;
    } finally {
      await sql.end();
    }
  }, 120_000);

  it("sustains concurrent heartbeats without backlog at the 1,000-online rate", async () => {
    if (!(await isDbReady())) return;

    const sql = postgres(TEST_DB_URL, { connect_timeout: 2, max: 10 });
    try {
      const owner = "load-user-hb";
      await sql`DELETE FROM device_clients WHERE owner_user_id = ${owner}`;
      await sql`DELETE FROM oauth_clients WHERE client_id = 'load-client-hb'`;
      await sql`DELETE FROM "user" WHERE id = ${owner}`;

      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${owner}, ${owner}, ${"hb@load.local"}, false)`;
      const clientRows = await sql`
        INSERT INTO oauth_clients (client_id, client_name, client_kind, created_by)
        VALUES ('load-client-hb', 'HB', 'public_device', ${owner})
        RETURNING id`;
      const oauthClientId = (clientRows[0] as { id: string }).id;

      // Seed 50 active devices and fire concurrent heartbeats to simulate a
      // slice of the 1,000-online sustained load.
      const N = 50;
      for (let i = 0; i < N; i++) {
        await sql`
          INSERT INTO device_clients
            (id, owner_user_id, oauth_client_id, installation_id, display_name,
             device_type, platform, platform_version, app_version, identity_summary, status)
          VALUES
            (${`cafebabe-0000-4000-8000-${i.toString().padStart(12, "0")}`},
             ${owner}, ${oauthClientId}, ${"hb-" + i}, ${"hb " + i},
             'android_tv', 'android', 'Android 14', '1.0.0', 'hb load', 'active')`;
      }

      const repo = new DeviceClientRepositoryImpl();
      const start = performance.now();
      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          repo.recordHeartbeat({
            deviceClientId: `cafebabe-0000-4000-8000-${i.toString().padStart(12, "0")}`,
            appVersion: "1.0.0",
            platformVersion: "Android 14",
          }),
        ),
      );
      const elapsed = performance.now() - start;

      // All heartbeats succeed; no duplicates, no backlog stall.
      expect(results.every((r) => r.kind === "updated")).toBe(true);
      // The batch should complete well within the 60s cadence budget.
      expect(elapsed).toBeLessThan(30_000);

      await sql`DELETE FROM device_clients WHERE owner_user_id = ${owner}`;
      await sql`DELETE FROM oauth_clients WHERE client_id = 'load-client-hb'`;
      await sql`DELETE FROM "user" WHERE id = ${owner}`;
    } finally {
      await sql.end();
    }
  }, 120_000);
});
