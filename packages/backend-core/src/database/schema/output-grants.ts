/**
 * OutputGrant (T006, feature 009-m3u-control-plane).
 *
 * Per-player / per-device revocable M3U output access
 * (data-model.md `OutputGrant`). Plaintext tokens are shown exactly once on
 * create/rotate; only `tokenPrefix` + `tokenHash` persist.
 *
 * Revocation is reversible only via a fresh create/rotate — never by
 * un-clearing `revokedAt`. `lastUsedAt` is updated by the playlist endpoint
 * on each successful read; we accept the race (last-write-wins) because the
 * field is informational, not authoritative.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const outputGrants = pgTable(
  "output_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: varchar("owner_user_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    deviceClientId: uuid("device_client_id"),
    profile: varchar("profile", { length: 20 }).notNull().default("primary"), // primary | all
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | revoked | expired
    tokenPrefix: varchar("token_prefix", { length: 32 }).notNull(),
    tokenHash: varchar("token_hash", { length: 120 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: varchar("revoked_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("output_grant_token_hash_idx").on(t.tokenHash),
    index("output_grant_owner_idx").on(t.ownerUserId, t.status),
    index("output_grant_device_idx").on(t.deviceClientId),
  ],
);
