/**
 * OauthAccessToken — stateful access tokens issued via the Client Credentials
 * Grant. Stateful (not JWT) so that revoking a client can instantly invalidate
 * every token it has issued.
 *
 * A token is valid iff: revokedAt IS NULL AND expiresAt > now.
 * Expired rows are cleaned up periodically (deleteExpired).
 */
import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { oauthClients } from "./oauth-clients";
import { deviceClients } from "./device-clients";
import { timestamps } from "./helpers";

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Owning client. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    deviceClientId: uuid("device_client_id").references(
      () => deviceClients.id,
      { onDelete: "cascade" },
    ),
    grantType: varchar("grant_type", { length: 64 })
      .notNull()
      .default("client_credentials"),
    scope: varchar("scope", { length: 255 }).notNull().default("open:read"),
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
    index("oauth_tokens_device_client_idx").on(t.deviceClientId),
    check(
      "oauth_tokens_grant_device_consistency_check",
      sql`(
        (${t.grantType} = 'client_credentials' AND ${t.deviceClientId} IS NULL)
        OR (${t.grantType} IN ('device_code', 'refresh_token') AND ${t.deviceClientId} IS NOT NULL)
      )`,
    ),
  ],
);
