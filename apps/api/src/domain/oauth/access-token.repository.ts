/**
 * IAccessTokenRepository (004-safe-operations).
 *
 * Infrastructure port (constitution III). The Drizzle implementation lives in
 * `infrastructure/database/access-token.repository.ts`.
 */
import type { AccessToken, CreateAccessTokenInput } from "./access-token.model";

/** NestJS DI token for the access-token repository. */
export const ACCESS_TOKEN_REPOSITORY = "ACCESS_TOKEN_REPOSITORY";

export interface IAccessTokenRepository {
  create(data: CreateAccessTokenInput): Promise<AccessToken>;
  /**
   * Lookup by hash, returning ONLY valid tokens (not revoked AND not expired).
   * This is the AccessTokenGuard's hot path.
   */
  findActiveByHash(tokenHash: string): Promise<AccessToken | null>;
  /** Find the owning client id for a token hash (for guard attribution). */
  findActiveByHashWithClient(tokenHash: string): Promise<{
    token: AccessToken;
    clientId: string;
    clientName: string;
    deviceClientId: string | null;
    ownerUserId: string | null;
    scope: string;
  } | null>;
  /** Batch-revoke every token for a client. Used when a client is revoked. */
  revokeByClientId(clientId: string, at?: Date): Promise<number>;
  /** Delete expired tokens (housekeeping). Returns rows deleted. */
  deleteExpired(before?: Date): Promise<number>;
  /** Bump the client's lastUsedAt when a token is exercised (best-effort). */
  touchClientLastUsed(tokenId: string): Promise<void>;
}
