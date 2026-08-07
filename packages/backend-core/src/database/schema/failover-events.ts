/**
 * FailoverEvent (T006, feature 009-m3u-control-plane).
 *
 * Audit-grade record of every primary-stream switch
 * (data-model.md `FailoverEvent`). One row per decision; rows are append-only.
 * The health-aggregation use case inserts the row in the same transaction
 * that updates `ChannelStream.isPrimary` and the canonical channel's
 * `primaryStreamId`.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const failoverEvents = pgTable(
  "failover_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalChannelId: uuid("canonical_channel_id").notNull(),
    previousStreamId: uuid("previous_stream_id"),
    nextStreamId: uuid("next_stream_id").notNull(),
    trigger: varchar("trigger", { length: 40 }).notNull(), // auto_failure_threshold | auto_recovery | manual
    reason: text("reason").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    observedBy: varchar("observed_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("failover_event_canonical_idx").on(t.canonicalChannelId, t.observedAt),
    index("failover_event_trigger_idx").on(t.trigger, t.observedAt),
  ],
);
