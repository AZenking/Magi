/**
 * StreamHealthObservation (T006, feature 009-m3u-control-plane).
 *
 * Immutable evidence written by both active probes and playback reports
 * (data-model.md `StreamHealthObservation`). The health-aggregation use case
 * reads these in chronological order to update `ChannelStream` health fields
 * and decide failover actions in one transaction.
 *
 * Rows are append-only; nothing here should ever be UPDATEd or DELETEd in
 * production code. Retention/cleanup is via a dedicated purge task.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const streamHealthObservations = pgTable(
  "stream_health_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    streamId: uuid("stream_id").notNull(),
    canonicalChannelId: uuid("canonical_channel_id").notNull(),
    source: varchar("source", { length: 30 }).notNull(), // active_probe | playback_report
    result: varchar("result", { length: 20 }).notNull(), // success | failure
    errorClass: varchar("error_class", { length: 60 }),
    latencyMs: integer("latency_ms"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    taskId: uuid("task_id"),
    deviceClientId: uuid("device_client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("health_observation_stream_idx").on(t.streamId, t.observedAt),
    index("health_observation_canonical_idx").on(t.canonicalChannelId, t.observedAt),
    index("health_observation_source_idx").on(t.source, t.observedAt),
  ],
);
