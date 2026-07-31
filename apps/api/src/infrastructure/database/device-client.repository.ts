import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type {
  ConsumeDeviceAuthorizationResult,
  CreateDeviceAuthorizationGrantInput,
  DeviceAuthorizationGrant,
  DeviceClient,
  DeviceClientProjection,
  DeviceClientRepository,
  DeviceRefreshToken,
  ListDeviceClientsQuery,
  RegisterDefaultDeviceResult,
} from "@/domain/device-client";
import { derivePresenceStatus } from "@/domain/device-client";
import { db } from "./connection";
import { DEVICE_CLIENT_CONFIG } from "../config/device-client.config";
import {
  auditEvents,
  deviceAuthorizationGrants,
  deviceClients,
  deviceRefreshTokens,
  oauthAccessTokens,
  outboxEvents,
} from "./schema";

function toDeviceClient(row: typeof deviceClients.$inferSelect): DeviceClient {
  return {
    ...row,
    deviceType: row.deviceType as DeviceClient["deviceType"],
    status: row.status as DeviceClient["status"],
  };
}

function toGrant(
  row: typeof deviceAuthorizationGrants.$inferSelect,
): DeviceAuthorizationGrant {
  return {
    ...row,
    deviceType: row.deviceType as DeviceAuthorizationGrant["deviceType"],
    status: row.status as DeviceAuthorizationGrant["status"],
  };
}

function toRefresh(
  row: typeof deviceRefreshTokens.$inferSelect,
): DeviceRefreshToken {
  return { ...row };
}

export class DeviceClientRepositoryImpl implements DeviceClientRepository {
  async listOwned(query: ListDeviceClientsQuery) {
    const asOf = query.asOf ?? new Date();
    const onlineSince = new Date(
      asOf.getTime() - DEVICE_CLIENT_CONFIG.onlineWindowSeconds * 1000,
    );
    const presenceRank = sql<number>`CASE
      WHEN ${deviceClients.status} = 'revoked' THEN 2
      WHEN ${deviceClients.lastHeartbeatAt} IS NOT NULL
        AND ${deviceClients.lastHeartbeatAt} >= ${sql.param(onlineSince, deviceClients.lastHeartbeatAt)} THEN 0
      ELSE 1 END`;
    const where = eq(deviceClients.ownerUserId, query.ownerUserId);
    const [rows, count] = await Promise.all([
      db
        .select()
        .from(deviceClients)
        .where(where)
        .orderBy(
          asc(presenceRank),
          sql`${deviceClients.lastHeartbeatAt} DESC NULLS LAST`,
          asc(deviceClients.id),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deviceClients)
        .where(where),
    ]);
    const items: DeviceClientProjection[] = rows.map((row) => {
      const client = toDeviceClient(row);
      return {
        ...client,
        presenceStatus: derivePresenceStatus(client, asOf),
        asOf,
      };
    });
    return { items, total: count[0]?.count ?? 0, asOf };
  }

  async findOwned(
    id: string,
    ownerUserId: string,
  ): Promise<DeviceClient | null> {
    const [row] = await db
      .select()
      .from(deviceClients)
      .where(
        and(
          eq(deviceClients.id, id),
          eq(deviceClients.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    return row ? toDeviceClient(row) : null;
  }

  async renameOwned(
    id: string,
    ownerUserId: string,
    displayName: string,
  ): Promise<DeviceClient | null> {
    const [row] = await db
      .update(deviceClients)
      .set({
        displayName,
        version: sql`${deviceClients.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deviceClients.id, id),
          eq(deviceClients.ownerUserId, ownerUserId),
          eq(deviceClients.status, "active"),
        ),
      )
      .returning();
    return row ? toDeviceClient(row) : null;
  }

  async revokeOwned(
    id: string,
    ownerUserId: string,
    revokedBy: string,
    at = new Date(),
    requestId?: string | null,
  ) {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(deviceClients)
        .set({
          status: "revoked",
          revokedAt: at,
          revokedBy,
          version: sql`${deviceClients.version} + 1`,
          updatedAt: at,
        })
        .where(
          and(
            eq(deviceClients.id, id),
            eq(deviceClients.ownerUserId, ownerUserId),
            eq(deviceClients.status, "active"),
          ),
        )
        .returning();

      if (!updated) {
        const [existing] = await tx
          .select()
          .from(deviceClients)
          .where(
            and(
              eq(deviceClients.id, id),
              eq(deviceClients.ownerUserId, ownerUserId),
            ),
          )
          .limit(1);
        if (!existing) return null;
        if (existing.status !== "revoked") return null;
        return {
          client: toDeviceClient(existing),
          accessTokensRevoked: 0,
          refreshTokensRevoked: 0,
          alreadyRevoked: true,
        };
      }

      const access = await tx
        .update(oauthAccessTokens)
        .set({ revokedAt: at, updatedAt: at })
        .where(
          and(
            eq(oauthAccessTokens.deviceClientId, id),
            isNull(oauthAccessTokens.revokedAt),
          ),
        )
        .returning({ id: oauthAccessTokens.id });
      const refresh = await tx
        .update(deviceRefreshTokens)
        .set({ revokedAt: at, updatedAt: at })
        .where(
          and(
            eq(deviceRefreshTokens.deviceClientId, id),
            isNull(deviceRefreshTokens.revokedAt),
          ),
        )
        .returning({ id: deviceRefreshTokens.id });

      const action = "device_client.revoked";
      const [audit] = await tx
        .insert(auditEvents)
        .values({
          actorType: "user",
          actorId: revokedBy,
          action,
          targetType: "device_client",
          targetId: id,
          displayName: updated.displayName,
          result: "succeeded",
          requestId: requestId ?? null,
          summary: {
            accessTokensRevoked: access.length,
            refreshTokensRevoked: refresh.length,
          },
        })
        .returning({ id: auditEvents.id });
      await tx.insert(outboxEvents).values({
        topic: `audit.${action}`,
        aggregateType: "device_client",
        aggregateId: id,
        payload: { auditEventId: audit!.id, result: "succeeded" },
        requestId: requestId ?? null,
        status: "pending",
        attempts: 0,
        availableAt: at,
      });

      return {
        client: toDeviceClient(updated),
        accessTokensRevoked: access.length,
        refreshTokensRevoked: refresh.length,
        alreadyRevoked: false,
      };
    });
  }

  async recordHeartbeat(input: {
    deviceClientId: string;
    appVersion: string;
    platformVersion: string;
    receivedAt?: Date;
  }) {
    const receivedAt = input.receivedAt ?? new Date();
    const [row] = await db
      .update(deviceClients)
      .set({
        lastHeartbeatAt: sql`GREATEST(COALESCE(${deviceClients.lastHeartbeatAt}, '-infinity'::timestamptz), ${sql.param(receivedAt, deviceClients.lastHeartbeatAt)})`,
        appVersion: input.appVersion,
        platformVersion: input.platformVersion,
        updatedAt: receivedAt,
      })
      .where(
        and(
          eq(deviceClients.id, input.deviceClientId),
          eq(deviceClients.status, "active"),
        ),
      )
      .returning({ lastHeartbeatAt: deviceClients.lastHeartbeatAt });
    if (row)
      return {
        kind: "updated" as const,
        lastHeartbeatAt: row.lastHeartbeatAt!,
      };
    const [existing] = await db
      .select({ status: deviceClients.status })
      .from(deviceClients)
      .where(eq(deviceClients.id, input.deviceClientId))
      .limit(1);
    return {
      kind:
        existing?.status === "revoked"
          ? ("revoked" as const)
          : ("not_found" as const),
    };
  }

  async registerDefaultDevice(
    input: import("@/domain/device-client").RegisterDefaultDeviceInput,
  ): Promise<RegisterDefaultDeviceResult | { kind: "revoked" }> {
    return db.transaction(async (tx) => {
      // The installation id is generated once on the TV and is the stable
      // identity for automatic registration. Concurrent first launches
      // converge on the same row through the unique constraint.
      await tx
        .insert(deviceClients)
        .values({
          ownerUserId: input.ownerUserId,
          oauthClientId: input.oauthClientId,
          installationId: input.installationId,
          displayName: input.displayName,
          deviceType: input.deviceType,
          platform: input.platform,
          platformVersion: input.platformVersion,
          appVersion: input.appVersion,
          identitySummary: input.identitySummary,
        })
        .onConflictDoNothing({
          target: [deviceClients.oauthClientId, deviceClients.installationId],
        });

      const [existing] = await tx
        .select()
        .from(deviceClients)
        .where(
          and(
            eq(deviceClients.oauthClientId, input.oauthClientId),
            eq(deviceClients.installationId, input.installationId),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new Error("device client registration did not create a row");
      }
      if (existing.status === "revoked") return { kind: "revoked" as const };

      const [updated] = await tx
        .update(deviceClients)
        .set({
          // A user rename is authoritative; automatic reconnects must not
          // overwrite it with the TV model name.
          ownerUserId: input.ownerUserId,
          platform: input.platform,
          platformVersion: input.platformVersion,
          appVersion: input.appVersion,
          identitySummary: input.identitySummary,
          version: sql`${deviceClients.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(deviceClients.id, existing.id))
        .returning();
      const clientRow = updated ?? existing;

      // A re-registration replaces the credential family so a lost local
      // refresh token cannot be used alongside the newly enrolled one.
      await tx
        .update(oauthAccessTokens)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(oauthAccessTokens.deviceClientId, clientRow.id),
            isNull(oauthAccessTokens.revokedAt),
          ),
        );
      await tx
        .update(deviceRefreshTokens)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(deviceRefreshTokens.deviceClientId, clientRow.id),
            isNull(deviceRefreshTokens.revokedAt),
          ),
        );

      const [accessRow] = await tx
        .insert(oauthAccessTokens)
        .values({
          clientId: input.oauthClientId,
          deviceClientId: clientRow.id,
          grantType: "device_code",
          scope: "open:read client:heartbeat",
          tokenHash: input.accessToken.hash,
          tokenPrefix: input.accessToken.prefix,
          expiresAt: input.accessToken.expiresAt,
        })
        .returning();
      const [refreshRow] = await tx
        .insert(deviceRefreshTokens)
        .values({
          deviceClientId: clientRow.id,
          oauthClientId: input.oauthClientId,
          familyId: input.refreshToken.familyId,
          generation: 1,
          tokenHash: input.refreshToken.hash,
          tokenPrefix: input.refreshToken.prefix,
          expiresAt: input.refreshToken.expiresAt,
        })
        .returning();

      const action = "device_client.auto_registered";
      const [registrationAudit] = await tx
        .insert(auditEvents)
        .values({
          actorType: "system",
          actorId: input.ownerUserId,
          action,
          targetType: "device_client",
          targetId: clientRow.id,
          displayName: clientRow.displayName,
          result: "succeeded",
          requestId: input.requestId ?? null,
          summary: {
            deviceType: clientRow.deviceType,
            platform: clientRow.platform,
            installationId: input.installationId,
          },
        })
        .returning({ id: auditEvents.id });
      await tx.insert(outboxEvents).values({
        topic: `audit.${action}`,
        aggregateType: "device_client",
        aggregateId: clientRow.id,
        payload: { auditEventId: registrationAudit!.id, result: "succeeded" },
        requestId: input.requestId ?? null,
        status: "pending",
        attempts: 0,
        availableAt: input.now,
      });

      return {
        client: toDeviceClient(clientRow),
        accessToken: {
          plaintext: input.accessToken.plaintext,
          expiresAt: accessRow!.expiresAt,
          scope: accessRow!.scope,
        },
        refreshToken: {
          plaintext: input.refreshToken.plaintext,
          familyId: refreshRow!.familyId,
          generation: refreshRow!.generation,
          expiresAt: refreshRow!.expiresAt,
        },
      };
    });
  }

  async createAuthorizationGrant(input: CreateDeviceAuthorizationGrantInput) {
    const [row] = await db
      .insert(deviceAuthorizationGrants)
      .values(input)
      .returning();
    return toGrant(row!);
  }

  async findAuthorizationByUserCode(userCodeDigest: string) {
    const [row] = await db
      .select()
      .from(deviceAuthorizationGrants)
      .where(eq(deviceAuthorizationGrants.userCodeDigest, userCodeDigest))
      .limit(1);
    return row ? toGrant(row) : null;
  }

  async findAuthorizationByDeviceCode(deviceCodeHash: string) {
    const [row] = await db
      .select()
      .from(deviceAuthorizationGrants)
      .where(eq(deviceAuthorizationGrants.deviceCodeHash, deviceCodeHash))
      .limit(1);
    return row ? toGrant(row) : null;
  }

  async approveAuthorization(
    id: string,
    ownerUserId: string,
    displayName: string,
    at = new Date(),
  ) {
    const [row] = await db
      .update(deviceAuthorizationGrants)
      .set({
        status: "approved",
        ownerUserId,
        approvedDisplayName: displayName,
        approvedAt: at,
        version: sql`${deviceAuthorizationGrants.version} + 1`,
        updatedAt: at,
      })
      .where(
        and(
          eq(deviceAuthorizationGrants.id, id),
          eq(deviceAuthorizationGrants.status, "pending"),
          gt(deviceAuthorizationGrants.expiresAt, at),
        ),
      )
      .returning();
    return row ? toGrant(row) : null;
  }

  async denyAuthorization(id: string, ownerUserId: string, at = new Date()) {
    const [row] = await db
      .update(deviceAuthorizationGrants)
      .set({
        status: "denied",
        ownerUserId,
        updatedAt: at,
        version: sql`${deviceAuthorizationGrants.version} + 1`,
      })
      .where(
        and(
          eq(deviceAuthorizationGrants.id, id),
          eq(deviceAuthorizationGrants.status, "pending"),
          gt(deviceAuthorizationGrants.expiresAt, at),
        ),
      )
      .returning();
    return row ? toGrant(row) : null;
  }

  async consumeAuthorization(input: {
    id: string;
    now: Date;
    requestId?: string | null;
    displayName: string;
    accessToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
    refreshToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
      familyId: string;
    };
  }): Promise<
    | ConsumeDeviceAuthorizationResult
    | { kind: "pending" | "slow_down" | "denied" | "expired" | "invalid" }
  > {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(deviceAuthorizationGrants)
        .where(eq(deviceAuthorizationGrants.id, input.id))
        .limit(1);
      if (!current) return { kind: "invalid" as const };
      if (
        current.expiresAt <= input.now &&
        ["pending", "approved"].includes(current.status)
      ) {
        await tx
          .update(deviceAuthorizationGrants)
          .set({ status: "expired", updatedAt: input.now })
          .where(eq(deviceAuthorizationGrants.id, current.id));
        return { kind: "expired" as const };
      }
      if (current.status === "pending") {
        const tooSoon =
          current.lastPolledAt &&
          input.now.getTime() - current.lastPolledAt.getTime() <
            current.pollIntervalSeconds * 1000;
        await tx
          .update(deviceAuthorizationGrants)
          .set({
            lastPolledAt: input.now,
            pollIntervalSeconds: tooSoon
              ? current.pollIntervalSeconds + 5
              : current.pollIntervalSeconds,
            updatedAt: input.now,
          })
          .where(eq(deviceAuthorizationGrants.id, current.id));
        return {
          kind: tooSoon ? ("slow_down" as const) : ("pending" as const),
        };
      }
      if (current.status === "denied") return { kind: "denied" as const };
      if (current.status !== "approved" || !current.ownerUserId)
        return { kind: "invalid" as const };

      // Reserve the approved grant before creating any device or token rows.
      // This conditional update is the single-use guard for concurrent polls;
      // a second consumer sees no row and cannot leave orphaned credentials.
      const [reserved] = await tx
        .update(deviceAuthorizationGrants)
        .set({
          status: "consumed",
          consumedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(deviceAuthorizationGrants.id, current.id),
            eq(deviceAuthorizationGrants.status, "approved"),
          ),
        )
        .returning();
      if (!reserved) return { kind: "invalid" as const };

      const [clientRow] = await tx
        .insert(deviceClients)
        .values({
          ownerUserId: current.ownerUserId,
          oauthClientId: current.oauthClientId,
          displayName: input.displayName,
          deviceType: current.deviceType,
          platform: current.platform,
          platformVersion: current.platformVersion,
          appVersion: current.appVersion,
          identitySummary: current.identitySummary,
        })
        .returning();
      const [accessRow] = await tx
        .insert(oauthAccessTokens)
        .values({
          clientId: current.oauthClientId,
          deviceClientId: clientRow!.id,
          grantType: "device_code",
          scope: "open:read client:heartbeat",
          tokenHash: input.accessToken.hash,
          tokenPrefix: input.accessToken.prefix,
          expiresAt: input.accessToken.expiresAt,
        })
        .returning();
      const [refreshRow] = await tx
        .insert(deviceRefreshTokens)
        .values({
          deviceClientId: clientRow!.id,
          oauthClientId: current.oauthClientId,
          familyId: input.refreshToken.familyId,
          generation: 1,
          tokenHash: input.refreshToken.hash,
          tokenPrefix: input.refreshToken.prefix,
          expiresAt: input.refreshToken.expiresAt,
        })
        .returning();
      const [registrationAudit] = await tx
        .insert(auditEvents)
        .values({
          actorType: "system",
          actorId: current.ownerUserId,
          action: "device_client.registered",
          targetType: "device_client",
          targetId: clientRow!.id,
          displayName: clientRow!.displayName,
          result: "succeeded",
          requestId: input.requestId ?? null,
          summary: {
            deviceType: clientRow!.deviceType,
            platform: clientRow!.platform,
          },
        })
        .returning({ id: auditEvents.id });
      await tx.insert(outboxEvents).values({
        topic: "audit.device_client.registered",
        aggregateType: "device_client",
        aggregateId: clientRow!.id,
        payload: { auditEventId: registrationAudit!.id, result: "succeeded" },
        requestId: input.requestId ?? null,
        status: "pending",
        attempts: 0,
        availableAt: input.now,
      });
      const [consumed] = await tx
        .update(deviceAuthorizationGrants)
        .set({
          deviceClientId: clientRow!.id,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(deviceAuthorizationGrants.id, current.id),
            eq(deviceAuthorizationGrants.status, "consumed"),
          ),
        )
        .returning();
      if (!consumed) return { kind: "invalid" as const };
      return {
        grant: toGrant(consumed),
        client: toDeviceClient(clientRow!),
        accessToken: {
          plaintext: input.accessToken.plaintext,
          expiresAt: accessRow!.expiresAt,
          scope: accessRow!.scope,
        },
        refreshToken: {
          plaintext: input.refreshToken.plaintext,
          familyId: refreshRow!.familyId,
          generation: refreshRow!.generation,
          expiresAt: refreshRow!.expiresAt,
        },
      };
    });
  }

  async findRefreshTokenByHash(hash: string) {
    const [row] = await db
      .select()
      .from(deviceRefreshTokens)
      .where(eq(deviceRefreshTokens.tokenHash, hash))
      .limit(1);
    return row ? toRefresh(row) : null;
  }

  async rotateRefreshToken(input: {
    tokenId: string;
    now: Date;
    nextAccessToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
    nextRefreshToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
  }) {
    return db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(deviceRefreshTokens)
        .where(eq(deviceRefreshTokens.id, input.tokenId))
        .limit(1);
      if (!old) return { kind: "invalid" as const };
      const [client] = await tx
        .select()
        .from(deviceClients)
        .where(eq(deviceClients.id, old.deviceClientId))
        .limit(1);
      if (
        !client ||
        client.status !== "active" ||
        old.revokedAt ||
        old.expiresAt <= input.now
      )
        return { kind: "invalid" as const };
      if (old.consumedAt) {
        await tx
          .update(deviceRefreshTokens)
          .set({ revokedAt: input.now, updatedAt: input.now })
          .where(eq(deviceRefreshTokens.familyId, old.familyId));
        await tx
          .update(oauthAccessTokens)
          .set({ revokedAt: input.now, updatedAt: input.now })
          .where(eq(oauthAccessTokens.deviceClientId, old.deviceClientId));
        return { kind: "replay" as const };
      }
      const [consumed] = await tx
        .update(deviceRefreshTokens)
        .set({ consumedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(deviceRefreshTokens.id, old.id),
            isNull(deviceRefreshTokens.consumedAt),
            isNull(deviceRefreshTokens.revokedAt),
          ),
        )
        .returning();
      if (!consumed) return { kind: "replay" as const };
      const [nextRefresh] = await tx
        .insert(deviceRefreshTokens)
        .values({
          deviceClientId: old.deviceClientId,
          oauthClientId: old.oauthClientId,
          familyId: old.familyId,
          generation: old.generation + 1,
          tokenHash: input.nextRefreshToken.hash,
          tokenPrefix: input.nextRefreshToken.prefix,
          expiresAt: input.nextRefreshToken.expiresAt,
        })
        .returning();
      await tx
        .update(deviceRefreshTokens)
        .set({ replacedById: nextRefresh!.id, updatedAt: input.now })
        .where(eq(deviceRefreshTokens.id, old.id));
      const [access] = await tx
        .insert(oauthAccessTokens)
        .values({
          clientId: old.oauthClientId,
          deviceClientId: old.deviceClientId,
          grantType: "refresh_token",
          scope: "open:read client:heartbeat",
          tokenHash: input.nextAccessToken.hash,
          tokenPrefix: input.nextAccessToken.prefix,
          expiresAt: input.nextAccessToken.expiresAt,
        })
        .returning();
      return {
        kind: "rotated" as const,
        deviceClient: toDeviceClient(client),
        accessToken: {
          plaintext: input.nextAccessToken.plaintext,
          expiresAt: access!.expiresAt,
          scope: access!.scope,
        },
        refreshToken: {
          plaintext: input.nextRefreshToken.plaintext,
          expiresAt: nextRefresh!.expiresAt,
          familyId: nextRefresh!.familyId,
          generation: nextRefresh!.generation,
        },
      };
    });
  }
}
