import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { canonicalChannels } from "./canonical-channels";
import { m3uSources } from "./m3u-sources";
import { rawM3uChannels } from "./raw-m3u-channels";
import { channels } from "./channels";

export const channelStreams = pgTable(
  "channel_streams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalChannelId: uuid("canonical_channel_id")
      .notNull()
      .references(() => canonicalChannels.id, { onDelete: "cascade" }),
    m3uSourceId: uuid("m3u_source_id").references(() => m3uSources.id, { onDelete: "set null" }),
    rawChannelId: uuid("raw_channel_id").references(() => rawM3uChannels.id, { onDelete: "set null" }),
    sourceChannelId: uuid("source_channel_id").references(() => channels.id, { onDelete: "set null" }),
    streamUrl: text("stream_url").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    healthStatus: varchar("health_status", { length: 20 })
      .notNull()
      .default("unknown"),
    responseTime: integer("response_time"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures")
      .notNull()
      .default(0),
    successRate: real("success_rate"),
    streamError: text("stream_error"),
    streamCodec: varchar("stream_codec", { length: 50 }),
    streamFormat: varchar("stream_format", { length: 50 }),
    streamWidth: integer("stream_width"),
    streamHeight: integer("stream_height"),
    streamFrameRate: real("stream_frame_rate"),
    streamBitrate: integer("stream_bitrate"),
    // --- Safe Operations expand columns (T018). Origin/position/eligibility
    // enable ordered failover; defaulted so existing rows keep working. ---
    origin: varchar("origin", { length: 20 }).default("source"), // source | manual
    position: integer("position"),
    eligibleForFailover: boolean("eligible_for_failover").notNull().default(true),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("channel_streams_canonical_idx").on(t.canonicalChannelId),
    index("channel_streams_health_idx").on(t.healthStatus),
    index("channel_streams_source_idx").on(t.m3uSourceId),
    index("channel_streams_position_idx").on(t.canonicalChannelId, t.position),
  ],
);
