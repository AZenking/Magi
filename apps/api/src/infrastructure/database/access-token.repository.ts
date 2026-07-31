/**
 * AccessTokenRepository — Drizzle implementation (004-safe-operations).
 *
 * Implements IAccessTokenRepository against `oauth_access_tokens`.
 * findActiveByHashWithClient is the AccessTokenGuard's hot path — a single
 * join resolves token validity (not revoked, not expired) + client attribution.
 */
import { eq, and, sql, isNull, gt, lt } from "drizzle-orm";
import type {
  AccessToken,
  CreateAccessTokenInput,
  IAccessTokenRepository,
} from "@/domain/oauth";
import { db } from "./connection";
import { oauthAccessTokens, oauthClients } from "./schema";

function toDomain(row: typeof oauthAccessTokens.$inferSelect): AccessToken {
  return { ...row };
}

export class AccessTokenRepository implements IAccessTokenRepository {
  async create(data: CreateAccessTokenInput): Promise<AccessToken> {
    const [row] = await db
      .insert(oauthAccessTokens)
      .values({
        clientId: data.clientId,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        expiresAt: data.expiresAt,
      })
      .returning();
    return toDomain(row!);
  }

  async findActiveByHash(tokenHash: string): Promise<AccessToken | null> {
    const [row] = await db
      .select()
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.tokenHash, tokenHash),
          isNull(oauthAccessTokens.revokedAt),
          gt(oauthAccessTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findActiveByHashWithClient(
    tokenHash: string,
  ): Promise<{ token: AccessToken; clientId: string; clientName: string } | null> {
    const [row] = await db
      .select({
        token: oauthAccessTokens,
        clientPublicId: oauthClients.clientId,
        clientName: oauthClients.clientName,
      })
      .from(oauthAccessTokens)
      .innerJoin(oauthClients, eq(oauthAccessTokens.clientId, oauthClients.id))
      .where(
        and(
          eq(oauthAccessTokens.tokenHash, tokenHash),
          isNull(oauthAccessTokens.revokedAt),
          gt(oauthAccessTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      token: toDomain(row.token),
      clientId: row.clientPublicId,
      clientName: row.clientName,
    };
  }

  async revokeByClientId(clientId: string, at: Date = new Date()): Promise<number> {
    const result = await db
      .update(oauthAccessTokens)
      .set({ revokedAt: at, updatedAt: at })
      .where(and(eq(oauthAccessTokens.clientId, clientId), isNull(oauthAccessTokens.revokedAt)))
      .returning({ id: oauthAccessTokens.id });
    return result.length;
  }

  async deleteExpired(before: Date = new Date()): Promise<number> {
    const result = await db
      .delete(oauthAccessTokens)
      .where(lt(oauthAccessTokens.expiresAt, before))
      .returning({ id: oauthAccessTokens.id });
    return result.length;
  }

  async touchClientLastUsed(tokenId: string): Promise<void> {
    const [row] = await db
      .select({ clientId: oauthAccessTokens.clientId })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.id, tokenId))
      .limit(1);
    if (!row) return;
    await db
      .update(oauthClients)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthClients.id, row.clientId));
  }
}
