/**
 * AccessToken domain model — stateful tokens for the Client Credentials Grant.
 *
 * A token is valid iff: revokedAt == null AND expiresAt > now.
 * Stateful storage (not JWT) so client revocation can instantly invalidate
 * every issued token.
 */
export interface AccessToken {
  id: string;
  /** Owning client (oauth_clients.id). */
  clientId: string;
  /** SHA-256(access_token) hex. Never the plaintext. */
  tokenHash: string;
  /** Masked prefix for debugging. */
  tokenPrefix: string;
  /** When the token ceases to be valid. */
  expiresAt: Date;
  /** Set when revoked. Null = active. */
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccessTokenInput {
  clientId: string;
  tokenHash: string;
  tokenPrefix: string;
  expiresAt: Date;
}

/** Whether the token is valid right now: not revoked AND not expired. */
export function isTokenValid(token: AccessToken, now: Date = new Date()): boolean {
  return token.revokedAt == null && token.expiresAt.getTime() > now.getTime();
}
