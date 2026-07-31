/**
 * OauthAccessToken — stateful access tokens issued via the Client Credentials
 * Grant. Stateful (not JWT) so that revoking a client can instantly invalidate
 * every token it has issued.
 *
 * A token is valid iff: revokedAt IS NULL AND expiresAt > now.
 * Expired rows are cleaned up periodically (deleteExpired).
 */
import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { oauthClients } from "./oauth-clients";
import { timestamps } from "./helpers";

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Owning client. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the access_token plaintext. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    /** Masked prefix for debugging. */
    tokenPrefix: varchar("token_prefix", { length: 12 }).notNull(),
    /** When the token ceases to be valid (issued_at + expires_in). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when the token is revoked (client revoke or manual). NULL = active. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oauth_tokens_hash_idx").on(t.tokenHash),
    index("oauth_tokens_client_expires_idx").on(t.clientId, t.expiresAt),
  ],
);
