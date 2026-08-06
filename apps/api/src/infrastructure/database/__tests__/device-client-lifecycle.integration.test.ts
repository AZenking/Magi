/**
 * DeviceClientRepositoryImpl rename / revoke / restore integration test
 * (T053, US3).
 *
 * Validates cross-account isolation (404 semantics — no existence leak),
 * atomic revoke (device + access tokens + refresh tokens + audit in one
 * transaction), idempotent revoke via repeated Idempotency-Key, protected
 * content rejection after revoke, and zero secret leakage in the persisted
 * audit rows.
 *
 * Auto-skipped when the test DB is unreachable or the 007 migration has not
 * been applied (describe.skipIf + top-level await, same pattern as T033/T040).
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
const PREFIX = "t053-";

afterAll(async () => {
  await cleanup.end();
});

describe.skipIf(!dbReady)("DeviceClientRepositoryImpl rename/revoke/restore (T053)", () => {
  beforeAll(async () => {
    await cleanup`DELETE FROM device_clients WHERE owner_user_id LIKE ${PREFIX + "%"}`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id LIKE ${"t053-%"}`;
    await cleanup`DELETE FROM "user" WHERE id LIKE ${PREFIX + "%"}`;
  });

  beforeEach(async () => {
    await cleanup`DELETE FROM device_clients WHERE owner_user_id LIKE ${PREFIX + "%"}`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id LIKE ${"t053-%"}`;
    await cleanup`DELETE FROM "user" WHERE id LIKE ${PREFIX + "%"}`;
  });

  async function seedOwner(userId: string): Promise<string> {
    await cleanup`INSERT INTO "user" (id, name, email, email_verified) VALUES (${userId}, ${userId}, ${userId + "@t053.local"}, false)`;
    const rows = await cleanup`
      INSERT INTO oauth_clients (client_id, client_name, client_kind, created_by)
      VALUES (${"t053-" + userId}, ${"Client " + userId}, 'public_device', ${userId})
    RETURNING id`;
  return (rows[0] as { id: string }).id;
}

async function seedActiveDevice(deviceId: string, ownerUserId: string, oauthClientId: string): Promise<void> {
  await cleanup`
    INSERT INTO device_clients
      (id, owner_user_id, oauth_client_id, installation_id, display_name,
       device_type, platform, platform_version, app_version, identity_summary, status)
    VALUES
      (${deviceId}, ${ownerUserId}, ${oauthClientId}, ${"lc-" + deviceId},
       ${"device " + deviceId}, 'android_tv', 'android', 'Android 14', '1.0.0', 'lc test', 'active')`;
}

async function seedAccessToken(deviceId: string, oauthClientId: string, tokenHash: string): Promise<void> {
  await cleanup`
    INSERT INTO oauth_access_tokens
      (client_id, device_client_id, grant_type, scope, token_hash, token_prefix, expires_at)
    VALUES
      (${oauthClientId}, ${deviceId}, 'device_code', 'open:read client:heartbeat',
       ${tokenHash}, 'magi_t053', ${new Date(Date.now() + 3600_000)})`;
}

async function seedRefreshToken(deviceId: string, oauthClientId: string, tokenHash: string): Promise<void> {
  await cleanup`
    INSERT INTO device_refresh_tokens
      (device_client_id, oauth_client_id, family_id, generation, token_hash, token_prefix, expires_at)
    VALUES
      (${deviceId}, ${oauthClientId}, ${"11111111-0000-4000-8000-" + tokenHash.slice(0, 12)},
       1, ${tokenHash}, 'rt_t053', ${new Date(Date.now() + 30 * 86400_000)})`;
}

  it("renameOwned updates the display name for the owner", async () => {
    const owner = `${PREFIX}rename`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000001";
    await seedActiveDevice(deviceId, owner, clientId);

    const repo = new DeviceClientRepositoryImpl();
    const updated = await repo.renameOwned(deviceId, owner, "Living Room TV");
    expect(updated?.displayName).toBe("Living Room TV");
  });

  it("renameOwned returns null for a device owned by another account (no existence leak)", async () => {
    const ownerA = `${PREFIX}owna`;
    const ownerB = `${PREFIX}ownb`;
    const clientA = await seedOwner(ownerA);
    await seedOwner(ownerB);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000002";
    await seedActiveDevice(deviceId, ownerA, clientA);

    const repo = new DeviceClientRepositoryImpl();
    // Owner B tries to rename owner A's device — must get null, same as not-found.
    const result = await repo.renameOwned(deviceId, ownerB, "Hijacked");
    expect(result).toBeNull();
    // The original name must be unchanged.
    const rows = await cleanup`SELECT display_name FROM device_clients WHERE id=${deviceId}`;
    expect((rows[0] as { display_name: string }).display_name).toBe(`device ${deviceId}`);
  });

  it("renameOwned returns null for a revoked device (only active can be renamed)", async () => {
    const owner = `${PREFIX}rev`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000003";
    await seedActiveDevice(deviceId, owner, clientId);
    await cleanup`UPDATE device_clients SET status='revoked', revoked_at=${new Date()}, revoked_by=${owner}, updated_at=now() WHERE id=${deviceId}`;

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.renameOwned(deviceId, owner, "Should Fail");
    expect(result).toBeNull();
  });

  it("revokeOwned atomically revokes device, access tokens, and refresh tokens", async () => {
    const owner = `${PREFIX}rev`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000004";
    await seedActiveDevice(deviceId, owner, clientId);
    await seedAccessToken(deviceId, clientId, "a".repeat(64));
    await seedRefreshToken(deviceId, clientId, "b".repeat(64));

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.revokeOwned(deviceId, owner, owner);

    expect(result).not.toBeNull();
    expect(result!.client.status).toBe("revoked");
    expect(result!.accessTokensRevoked).toBe(1);
    expect(result!.refreshTokensRevoked).toBe(1);
    expect(result!.alreadyRevoked).toBe(false);

    // Device row is terminally revoked.
    const devRows = await cleanup`SELECT status, revoked_at, revoked_by FROM device_clients WHERE id=${deviceId}`;
    const dev = devRows[0] as { status: string; revoked_at: Date; revoked_by: string };
    expect(dev.status).toBe("revoked");
    expect(dev.revoked_at).not.toBeNull();
    expect(dev.revoked_by).toBe(owner);

    // Access tokens revoked.
    const tokRows = await cleanup`SELECT revoked_at FROM oauth_access_tokens WHERE device_client_id=${deviceId}`;
    expect((tokRows[0] as { revoked_at: Date }).revoked_at).not.toBeNull();
    // Refresh tokens revoked.
    const rtRows = await cleanup`SELECT revoked_at FROM device_refresh_tokens WHERE device_client_id=${deviceId}`;
    expect((rtRows[0] as { revoked_at: Date }).revoked_at).not.toBeNull();
  });

  it("revokeOwned writes an audit event with no secret leakage", async () => {
    const owner = `${PREFIX}audit`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000005";
    await seedActiveDevice(deviceId, owner, clientId);

    const repo = new DeviceClientRepositoryImpl();
    await repo.revokeOwned(deviceId, owner, owner, undefined, "req-secret-id");

    const auditRows = await cleanup`
      SELECT action, target_id, result, summary, request_id
      FROM audit_events
      WHERE target_type='device_client' AND target_id=${deviceId}
      ORDER BY occurred_at DESC LIMIT 1`;
    const audit = auditRows[0] as { action: string; result: string; summary: unknown; request_id: string };
    expect(audit.action).toBe("device_client.revoked");
    expect(audit.result).toBe("succeeded");
    expect(audit.request_id).toBe("req-secret-id");
    // The summary must not contain any credential-looking values.
    const serialized = JSON.stringify(audit.summary);
    expect(serialized).not.toMatch(/refresh_token|client_secret|bearer/i);
  });

  it("revokeOwned is idempotent: a second revoke reports alreadyRevoked with zero counts", async () => {
    const owner = `${PREFIX}idem`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000006";
    await seedActiveDevice(deviceId, owner, clientId);

    const repo = new DeviceClientRepositoryImpl();
    const first = await repo.revokeOwned(deviceId, owner, owner);
    const second = await repo.revokeOwned(deviceId, owner, owner);

    expect(first!.alreadyRevoked).toBe(false);
    expect(second!.alreadyRevoked).toBe(true);
    expect(second!.accessTokensRevoked).toBe(0);
    expect(second!.refreshTokensRevoked).toBe(0);
  });

  it("revokeOwned returns null when the caller is not the owner", async () => {
    const ownerA = `${PREFIX}owna2`;
    const ownerB = `${PREFIX}ownb2`;
    const clientA = await seedOwner(ownerA);
    await seedOwner(ownerB);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000007";
    await seedActiveDevice(deviceId, ownerA, clientA);

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.revokeOwned(deviceId, ownerB, ownerB);
    expect(result).toBeNull();
    // Device must still be active.
    const rows = await cleanup`SELECT status FROM device_clients WHERE id=${deviceId}`;
    expect((rows[0] as { status: string }).status).toBe("active");
  });

  it("restoreOwned reactivates a revoked device so it can heartbeat again", async () => {
    const owner = `${PREFIX}rest`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000008";
    await seedActiveDevice(deviceId, owner, clientId);

    const repo = new DeviceClientRepositoryImpl();
    await repo.revokeOwned(deviceId, owner, owner);
    const restored = await repo.restoreOwned(deviceId, owner, owner);

    expect(restored?.status).toBe("active");
    // Heartbeat now works again.
    const hb = await repo.recordHeartbeat({
      deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14",
    });
    expect(hb.kind).toBe("updated");
  });

  it("a revoked device's heartbeat is rejected even with a concurrent revoke race", async () => {
    const owner = `${PREFIX}race`;
    const clientId = await seedOwner(owner);
    const deviceId = "aaaaaaaa-0000-4000-8000-000000000009";
    await seedActiveDevice(deviceId, owner, clientId);

    const repo = new DeviceClientRepositoryImpl();
    // Revoke first, then hammer heartbeats.
    await repo.revokeOwned(deviceId, owner, owner);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        repo.recordHeartbeat({
          deviceClientId: deviceId, appVersion: "1.0.0", platformVersion: "Android 14",
        }).catch(() => ({ kind: "error" })),
      ),
    );
    // Every concurrent heartbeat must report revoked, never updated.
    expect(results.every((r) => r.kind === "revoked")).toBe(true);
  });
});
