import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { m3uSources } from "./m3u-sources";

export const rawM3uChannels = pgTable(
  "raw_m3u_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => m3uSources.id, { onDelete: "cascade" }),
    tvgId: varchar("tvg_id", { length: 255 }),
    tvgName: varchar("tvg_name", { length: 255 }),
    tvgLogo: text("tvg_logo"),
    groupTitle: varchar("group_title", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    streamUrl: text("stream_url").notNull(),
    channelIdentity: varchar("channel_identity", { length: 512 }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    disappeared: boolean("disappeared").notNull().default(false),
    // --- 009-m3u-control-plane: source-presence lifecycle (FR-017). ---
    // present | missing | purged. `missing` retains identity + history for
    // 30 days; `purged` is the terminal state after retention expires.
    sourcePresence: varchar("source_presence", { length: 20 }).notNull().default("present"),
    missingSince: timestamp("missing_since", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("raw_m3u_source_idx").on(t.sourceId),
    uniqueIndex("raw_m3u_identity_idx").on(t.sourceId, t.channelIdentity),
    index("raw_m3u_presence_idx").on(t.sourceId, t.sourcePresence),
    index("raw_m3u_missing_since_idx").on(t.missingSince),
  ],
);
