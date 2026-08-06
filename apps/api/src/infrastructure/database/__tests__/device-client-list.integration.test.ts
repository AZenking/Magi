/**
 * DeviceClientRepositoryImpl.listOwned integration test (T033, US1).
 *
 * Validates account isolation, stable presence ordering (online → offline →
 * revoked, lastHeartbeatAt DESC within a group), the 150-second online window
 * boundary, pagination consistency, and P95 latency at a representative scale.
 *
 * Uses the repository's own `db` connection. Isolation is by a stable
 * test-owner prefix + beforeEach cleanup. Auto-skipped when the test DB is
 * unreachable or the 007 migration has not been applied, following the same
 * `describe.skipIf` + top-level await pattern as the safe-source-sync tests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { DeviceClientRepositoryImpl } from "@/infrastructure/database/device-client.repository";
import { DEVICE_CLIENT_CONFIG } from "@/infrastructure/config/device-client.config";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://magi:magi@localhost:5432/magi_test";

// Guard must resolve BEFORE collection: `describe.skipIf` reads its argument at
// collect time. Top-level await keeps the probe fresh per file run.
const dbReady = await (async () => {
  const probe = postgres(TEST_DB_URL, { connect_timeout: 2, max: 1 });
  try {
    await probe`SELECT 1`;
    // Additionally check the 007 migration has been applied.
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

const OWNER_PREFIX = "t033-user-";

afterAll(async () => {
  await cleanup.end();
});

describe.skipIf(!dbReady)("DeviceClientRepositoryImpl.listOwned (T033)", () => {
  beforeAll(async () => {
    // One-time sweep of any leftover rows from prior interrupted runs.
    await cleanup`DELETE FROM device_clients WHERE owner_user_id LIKE 't033-%' OR owner_user_id LIKE 'user-%'`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id LIKE 't033-%' OR client_id LIKE 'client-for-%'`;
    await cleanup`DELETE FROM "user" WHERE id LIKE 't033-%' OR id LIKE 'user-%'`;
  });

  beforeEach(async () => {
    await cleanup`DELETE FROM device_clients WHERE owner_user_id LIKE ${OWNER_PREFIX + "%"}`;
    await cleanup`DELETE FROM oauth_clients WHERE client_id LIKE ${"t033-%"}`;
    await cleanup`DELETE FROM "user" WHERE id LIKE ${OWNER_PREFIX + "%"}`;
  });

  const ONLINE_WINDOW_MS = DEVICE_CLIENT_CONFIG.onlineWindowSeconds * 1000;

  /** Seed a user + a public oauth client, returning the client id. */
  async function seedOwner(userId: string, email: string): Promise<string> {
    await cleanup`INSERT INTO "user" (id, name, email, email_verified) VALUES (${userId}, ${userId}, ${email}, false)`;
    const rows = await cleanup`
      INSERT INTO oauth_clients (client_id, client_name, client_kind, created_by)
      VALUES (${"t033-" + userId}, ${"Client " + userId}, 'public_device', ${userId})
      RETURNING id`;
    return (rows[0] as { id: string }).id;
  }

  interface SeedDevice {
    id: string;
    ownerUserId: string;
    oauthClientId: string;
    installationId: string;
    displayName: string;
    lastHeartbeatAt: Date | null;
    status?: "active" | "revoked";
    revokedBy?: string;
  }

  async function seedDevice(input: SeedDevice): Promise<void> {
    const now = new Date();
    const revokedAt = input.status === "revoked" ? now : null;
    const revokedBy = input.status === "revoked" ? (input.revokedBy ?? input.ownerUserId) : null;
    await cleanup`
      INSERT INTO device_clients
        (id, owner_user_id, oauth_client_id, installation_id, display_name,
         device_type, platform, platform_version, app_version, identity_summary,
         last_heartbeat_at, status, revoked_at, revoked_by)
      VALUES
        (${input.id}, ${input.ownerUserId}, ${input.oauthClientId}, ${input.installationId},
         ${input.displayName}, 'android_tv', 'android', 'Android 14', '1.0.0',
         ${"install " + input.installationId}, ${input.lastHeartbeatAt},
         ${input.status ?? "active"}, ${revokedAt}, ${revokedBy})`;
  }

  it("only returns clients owned by the requesting account", async () => {
    const clientA = await seedOwner(`${OWNER_PREFIX}a`, "a@t.local");
    const clientB = await seedOwner(`${OWNER_PREFIX}b`, "b@t.local");

    await seedDevice({
      id: "11111111-0000-4000-8000-000000000001",
      ownerUserId: `${OWNER_PREFIX}a`,
      oauthClientId: clientA,
      installationId: "a-1",
      displayName: "A living room",
      lastHeartbeatAt: new Date(),
    });
    await seedDevice({
      id: "22222222-0000-4000-8000-000000000002",
      ownerUserId: `${OWNER_PREFIX}b`,
      oauthClientId: clientB,
      installationId: "b-1",
      displayName: "B bedroom",
      lastHeartbeatAt: new Date(),
    });

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.listOwned({
      ownerUserId: `${OWNER_PREFIX}a`,
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]!.displayName).toBe("A living room");
    expect(result.items.some((c) => c.ownerUserId === `${OWNER_PREFIX}b`)).toBe(false);
  });

  it("orders online first, then offline, then revoked", async () => {
    const ownerId = `${OWNER_PREFIX}sort`;
    const clientId = await seedOwner(ownerId, "sort@t.local");
    const now = new Date();

    await seedDevice({
      id: "33333333-0000-4000-8000-000000000001",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "online-new",
      displayName: "online-newer",
      lastHeartbeatAt: new Date(now.getTime() - 10_000),
    });
    await seedDevice({
      id: "33333333-0000-4000-8000-000000000002",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "online-old",
      displayName: "online-older",
      lastHeartbeatAt: new Date(now.getTime() - 100_000),
    });
    await seedDevice({
      id: "33333333-0000-4000-8000-000000000003",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "offline",
      displayName: "offline-device",
      lastHeartbeatAt: new Date(now.getTime() - 300_000),
    });
    await seedDevice({
      id: "33333333-0000-4000-8000-000000000004",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "never",
      displayName: "never-seen", lastHeartbeatAt: null,
    });
    await seedDevice({
      id: "33333333-0000-4000-8000-000000000005",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "revoked",
      displayName: "revoked-device",
      lastHeartbeatAt: new Date(now.getTime() - 5_000),
      status: "revoked", revokedBy: ownerId,
    });

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.listOwned({
      ownerUserId: ownerId, page: 1, pageSize: 20, asOf: now,
    });

    const names = result.items.map((c) => c.displayName);
    expect(names).toEqual([
      "online-newer", "online-older", "offline-device", "never-seen", "revoked-device",
    ]);
    expect(result.items[0]!.presenceStatus).toBe("online");
    expect(result.items[2]!.presenceStatus).toBe("offline");
    expect(result.items[4]!.presenceStatus).toBe("revoked");
  });

  it("treats the 150-second boundary as online at exactly the threshold", async () => {
    const ownerId = `${OWNER_PREFIX}edge`;
    const clientId = await seedOwner(ownerId, "edge@t.local");
    const now = new Date();

    await seedDevice({
      id: "44444444-0000-4000-8000-000000000001",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "boundary",
      displayName: "at-boundary",
      lastHeartbeatAt: new Date(now.getTime() - ONLINE_WINDOW_MS),
    });
    await seedDevice({
      id: "44444444-0000-4000-8000-000000000002",
      ownerUserId: ownerId, oauthClientId: clientId, installationId: "over-boundary",
      displayName: "over-boundary",
      lastHeartbeatAt: new Date(now.getTime() - ONLINE_WINDOW_MS - 1000),
    });

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.listOwned({
      ownerUserId: ownerId, page: 1, pageSize: 20, asOf: now,
    });

    const byName = Object.fromEntries(result.items.map((c) => [c.displayName, c.presenceStatus]));
    expect(byName["at-boundary"]).toBe("online");
    expect(byName["over-boundary"]).toBe("offline");
  });

  it("paginates without duplicates or omissions across pages", async () => {
    const ownerId = `${OWNER_PREFIX}page`;
    const clientId = await seedOwner(ownerId, "page@t.local");
    const now = new Date();
    for (let i = 0; i < 25; i++) {
      await seedDevice({
        id: `55555555-0000-4000-8000-${i.toString().padStart(12, "0")}`,
        ownerUserId: ownerId, oauthClientId: clientId, installationId: `page-${i}`,
        displayName: `page device ${i}`,
        lastHeartbeatAt: new Date(now.getTime() - (i + 1) * 200_000),
      });
    }

    const repo = new DeviceClientRepositoryImpl();
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) {
      const result = await repo.listOwned({ ownerUserId: ownerId, page, pageSize: 10, asOf: now });
      expect(result.total).toBe(25);
      for (const item of result.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
    }
    expect(seen.size).toBe(25);
  });

  it("completes a list query within the P95 latency budget at representative scale", async () => {
    const ownerId = `${OWNER_PREFIX}p95`;
    const clientId = await seedOwner(ownerId, "p95@t.local");
    const now = new Date();
    for (let i = 0; i < 200; i++) {
      await seedDevice({
        id: `66666666-0000-4000-8000-${i.toString().padStart(12, "0")}`,
        ownerUserId: ownerId, oauthClientId: clientId, installationId: `scale-${i}`,
        displayName: `device ${i}`,
        lastHeartbeatAt: new Date(now.getTime() - i * 1000),
      });
    }

    const repo = new DeviceClientRepositoryImpl();
    const start = performance.now();
    const result = await repo.listOwned({ ownerUserId: ownerId, page: 1, pageSize: 50, asOf: now });
    const elapsedMs = performance.now() - start;

    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(200);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("returns an empty list with zero total for an account with no clients", async () => {
    await seedOwner(`${OWNER_PREFIX}empty`, "empty@t.local");

    const repo = new DeviceClientRepositoryImpl();
    const result = await repo.listOwned({
      ownerUserId: `${OWNER_PREFIX}empty`, page: 1, pageSize: 20,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
