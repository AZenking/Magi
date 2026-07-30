/**
 * ApiKey — Open API client credentials (005-open-channels-epg-api).
 *
 * Platform-issued access keys for the read-only open API (/api/open/v1/*).
 * The plaintext key is shown once at creation; only its SHA-256 hash is
 * persisted (data-model.md, FR-002). `scopes` is reserved for future
 * per-key channel visibility (YAGNI — not implemented in v1).
 */
import { pgTable, uuid, varchar, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: jsonb("scopes"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_status_idx").on(t.status),
  ],
);
