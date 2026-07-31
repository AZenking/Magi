/**
 * OauthClient — registered clients for the Client Credentials Grant
 * (replaces api_keys). The client_secret is shown once at creation; only its
 * SHA-256 hash is persisted (same security model as the former API keys).
 *
 * Status machine:
 *   active ⇄ disabled   (reversible — admin temporarily pauses token issuance)
 *   → revoked           (terminal — all issued tokens are batch-revoked)
 *
 * disable vs revoke:
 *   - disable only flips status; already-issued tokens keep working until they
 *     naturally expire, but the client cannot mint new tokens.
 *   - revoke flips status AND batch-revokes every token for this client, so
 *     in-flight devices lose access immediately.
 */
import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Public client identifier, e.g. "magi_tv_android". */
    clientId: varchar("client_id", { length: 64 }).notNull(),
    /** Human-readable label, e.g. "客厅电视". */
    clientName: varchar("client_name", { length: 120 }).notNull(),
    /** SHA-256 hex of the client_secret plaintext. Never the plaintext. */
    secretHash: varchar("secret_hash", { length: 64 }).notNull(),
    /** Masked prefix for list display, e.g. "magi_3f9…". */
    secretPrefix: varchar("secret_prefix", { length: 12 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active|disabled|revoked
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oauth_clients_client_id_idx").on(t.clientId),
    index("oauth_clients_status_idx").on(t.status),
  ],
);
