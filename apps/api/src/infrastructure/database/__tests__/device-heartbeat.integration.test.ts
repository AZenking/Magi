/**
 * DeviceClientRepositoryImpl.recordHeartbeat integration test (T040, US2).
 *
 * Validates the conditional monotonic heartbeat update: duplicate / out-of-order
 * / concurrent heartbeats never create duplicate devices, lastHeartbeatAt only
 * moves forward, revoked clients stay revoked, and the revoke race always ends
 * with a terminal revoked status.
 *
 * Auto-skipped when the test DB is unreachable or the 007 migration has not
 * been applied (describe.skipIf + top-level await, same pattern as T033).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { DeviceClientRepositoryImpl } from "@/infrastructure/database/device-client.repository";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:5432/magi_test";

const dbReady = await (async () => {
  const probe = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
  try {
    await probe`SELECT 1`;
    const rows = await probe`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'device_clients' AND column_name = 'last_heartbeat_at'`;
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
})();

const cleanup = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
const OWNER = "t040-user-heartbeat";

afterAll(async () => {
  await cleanup.end();
});

describe.skipIf(!dbReady)("DeviceClientRepositoryImpl.recordHeartbeat (T040)", () => {
  beforeAll(async () => {
    await cleanup`DELETE FROM device_clients WHERE owner_user_id = ${OWNER}`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id = 't040-heartbeat'`;
    await cleanup`DELETE FROM "user" WHERE id = ${OWNER}`;
  });

  beforeEach(async () => {
    await cleanup`DELETE FROM device_clients WHERE owner_user_id = ${OWNER}`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id = 't040-heartbeat'`;
    await cleanup`DELETE FROM "user" WHERE id = ${OWNER}`;
    await cleanup`INSERT INTO "user" (id, name, email, email_verified) VALUES (${OWNER}, ${OWNER}, ${OWNER + "@t040.local"}, false)`;
    await cleanup`INSERT INTO oauth_clients (client_id, client_name, client_kind, created_by) VALUES ('t040-heartbeat', 'T040', 'public_device', ${OWNER})`;
  });

  async function getOauthClientId(): Promise<string> {
    const rows = await cleanup`SELECT id FROM oauth_clients WHERE client_id = 't040-heartbeat'`;
    return (rows[0] as { id: string }).id;
  }

async function seedActiveDevice(deviceId: string, lastHeartbeatAt: Date | null): Promise<void> {
  const oauthClientId = await getOauthClientId();
  await cleanup`
    INSERT INTO device_clients
      (id, owner_user_id, oauth_client_id, installation_id, display_name,
       device_type, platform, platform_version, app_version, identity_summary,
       last_heartbeat_at, status)
    VALUES
      (${deviceId}, ${OWNER}, ${oauthClientId}, ${"hb-" + deviceId},
       ${"device " + deviceId}, 'android_tv', 'android', 'Android 14', '1.0.0',
       'hb test', ${lastHeartbeatAt}, 'active')`;
}

async function getDeviceStatus(deviceId: string): Promise<{ status: string; lastHeartbeatAt: Date | null }> {
  const rows = await cleanup`SELECT status, last_heartbeat_at FROM device_clients WHERE id = ${deviceId}`;
  const row = rows[0] as { status: string; last_heartbeat_at: Date | null } | undefined;
  return { status: row?.status ?? "missing", lastHeartbeatAt: row?.last_heartbeat_at ?? null };
}

  it("updates lastHeartbeatAt to the received time for an active device", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000001";
    await seedActiveDevice(deviceId, null);
    const repo = new DeviceClientRepositoryImpl();
    const received = new Date();

    const result = await repo.recordHeartbeat({
      deviceClientId: deviceId,
      appVersion: "1.0.0",
      platformVersion: "Android 14",
      receivedAt: received,
    });

    expect(result.kind).toBe("updated");
    if (result.kind === "updated") {
      expect(result.lastHeartbeatAt.getTime()).toBe(received.getTime());
    }
  });

  it("does not move lastHeartbeatAt backward on an out-of-order heartbeat", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000002";
    const newer = new Date("2026-08-01T12:00:00Z");
    const older = new Date("2026-08-01T10:00:00Z");
    await seedActiveDevice(deviceId, newer);
    const repo = new DeviceClientRepositoryImpl();

    const result = await repo.recordHeartbeat({
      deviceClientId: deviceId,
      appVersion: "1.0.0",
      platformVersion: "Android 14",
      receivedAt: older,
    });

    expect(result.kind).toBe("updated");
    const after = await getDeviceStatus(deviceId);
    // GREATEST keeps the newer value — timestamp did not regress.
    expect(after.lastHeartbeatAt!.getTime()).toBe(newer.getTime());
  });

  it("returns 'revoked' and leaves lastHeartbeatAt untouched for a revoked device", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000003";
    const oldBeat = new Date("2026-08-01T08:00:00Z");
    await seedActiveDevice(deviceId, oldBeat);
    // Revoke it directly.
    await cleanup`UPDATE device_clients SET status='revoked', revoked_at=${new Date()}, revoked_by=${OWNER}, updated_at=now() WHERE id=${deviceId}`;
    const repo = new DeviceClientRepositoryImpl();

    const result = await repo.recordHeartbeat({
      deviceClientId: deviceId,
      appVersion: "1.0.0",
      platformVersion: "Android 14",
      receivedAt: new Date(),
    });

    expect(result.kind).toBe("revoked");
    const after = await getDeviceStatus(deviceId);
    expect(after.status).toBe("revoked");
    expect(after.lastHeartbeatAt!.getTime()).toBe(oldBeat.getTime());
  });

  it("returns 'not_found' for a non-existent device id", async () => {
    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.recordHeartbeat({
      deviceClientId: "99999999-0000-4000-8000-000000000099",
      appVersion: "1.0.0",
      platformVersion: "Android 14",
    });
    expect(result.kind).toBe("not_found");
  });

  it("100 concurrent heartbeats do not create a duplicate device", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000004";
    await seedActiveDevice(deviceId, null);
    const repo = new DeviceClientRepositoryImpl();
    const received = new Date();

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        repo.recordHeartbeat({
          deviceClientId: deviceId,
          appVersion: "1.0.0",
          platformVersion: "Android 14",
          receivedAt: received,
        }),
      ),
    );

    expect(results.every((r) => r.kind === "updated")).toBe(true);
    // Exactly one device row — no duplicates created.
    const countRows = await cleanup`SELECT count(*)::int AS n FROM device_clients WHERE id=${deviceId}`;
    expect((countRows[0] as { n: number }).n).toBe(1);
  });

  it("a heartbeat racing with revoke ends with the device revoked", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000005";
    await seedActiveDevice(deviceId, null);
    const repo = new DeviceClientRepositoryImpl();

    // Fire many heartbeats concurrently with a single revoke.
    const tasks = [
      ...Array.from({ length: 50 }, () =>
        repo.recordHeartbeat({
          deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14",
        }).catch(() => ({ kind: "error" })),
      ),
      repo.revokeOwned(deviceId, OWNER, OWNER).catch(() => null),
    ];
    await Promise.all(tasks);

    const after = await getDeviceStatus(deviceId);
    // Revoke always wins the final state, regardless of heartbeat timing.
    expect(after.status).toBe("revoked");

    // A heartbeat AFTER the revoke completes must report revoked, never updated.
    const lateHeartbeat = await repo.recordHeartbeat({
      deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14",
    });
    expect(lateHeartbeat.kind).toBe("revoked");
  });

  it("is idempotent: repeated identical heartbeats advance time monotonically", async () => {
    const deviceId = "77777777-0000-4000-8000-000000000006";
    await seedActiveDevice(deviceId, null);
    const repo = new DeviceClientRepositoryImpl();

    const t1 = new Date("2026-08-01T12:00:00Z");
    const r1 = await repo.recordHeartbeat({ deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14", receivedAt: t1 });
    expect(r1.kind).toBe("updated");

    // Same time again — no regression.
    const r2 = await repo.recordHeartbeat({ deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14", receivedAt: t1 });
    expect(r2.kind).toBe("updated");

    const after = await getDeviceStatus(deviceId);
    expect(after.lastHeartbeatAt!.getTime()).toBe(t1.getTime());
  });
});
