/**
 * IdempotencyRecord (T016).
 *
 * Persistent idempotency for non-idempotent commands (data-model.md, research
 * §7). Unique (actorId, command, idempotencyKey). Same key + different
 * requestFingerprint is rejected. Minimum and default retention: 24h.
 */
import { pgTable, uuid, varchar, timestamp, jsonb, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    command: varchar("command", { length: 60 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 80 }).notNull(),
    responseStatus: integer("response_status"),
    responseRef: jsonb("response_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("idempotency_actor_command_key_idx").on(t.actorId, t.command, t.idempotencyKey),
    index("idempotency_expires_idx").on(t.expiresAt),
  ],
);
