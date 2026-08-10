/**
 * OutputPublication (T006, feature 009-m3u-control-plane).
 *
 * Single-row-per-output projection of the dynamically generated M3U
 * directory (data-model.md `OutputPublication`). Not a file on disk — the
 * playlist endpoint generates content on demand and this row captures the
 * last-known successful state for management UIs.
 *
 * Mutated by the publication projection use case after every successful
 * apply, failover or grant change. `revision` is a strictly-increasing
 * sequence (timestamp + counter) so consumers can detect "same directory"
 * vs "stale".
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const outputPublications = pgTable(
  "output_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Single logical publication per scope; use a sentinel UUID for the
    // primary publication so upsert logic is straightforward.
    scope: varchar("scope", { length: 40 }).notNull().default("primary"),
    revision: varchar("revision", { length: 80 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("fresh"), // fresh | stale | blocked
    publishedAt: timestamp("published_at", { withTimezone: true }),
    channelCount: integer("channel_count").notNull().default(0),
    playableChannelCount: integer("playable_channel_count")
      .notNull()
      .default(0),
    excludedChannelCount: integer("excluded_channel_count")
      .notNull()
      .default(0),
    blockingReason: text("blocking_reason"),
    lastApplyChangeSetId: uuid("last_apply_change_set_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("output_publications_scope_idx").on(t.scope)],
);
