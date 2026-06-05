import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { m3uSources } from "./m3u-sources";
import { rawM3uChannels } from "./raw-m3u-channels";

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelIdentity: varchar("channel_identity", { length: 512 }).notNull().unique(),
    m3uSourceId: uuid("m3u_source_id").references(() => m3uSources.id, {
      onDelete: "set null",
    }),
    rawChannelId: uuid("raw_channel_id").references(() => rawM3uChannels.id, {
      onDelete: "set null",
    }),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    groupTitle: varchar("group_title", { length: 255 }),
    tvgId: varchar("tvg_id", { length: 255 }),
    tvgLogo: text("tvg_logo"),
    streamUrl: text("stream_url"),
    epgChannelId: varchar("epg_channel_id", { length: 255 }),
    epgMatchType: varchar("epg_match_type", { length: 20 }),
    active: boolean("active").notNull().default(true),
    streamStatus: varchar("stream_status", { length: 20 }),
    streamResponseTime: integer("stream_response_time"),
    streamCheckedAt: timestamp("stream_checked_at", { withTimezone: true }),
    streamError: text("stream_error"),
    ...timestamps,
  },
  (t) => [index("channels_m3u_source_idx").on(t.m3uSourceId)],
);
