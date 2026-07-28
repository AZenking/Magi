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

export const canonicalChannels = pgTable(
  "canonical_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    standardName: varchar("standard_name", { length: 255 }).notNull(),
    standardGroup: varchar("standard_group", { length: 255 }),
    standardLogo: text("standard_logo"),
    channelNumber: integer("channel_number"),
    hidden: boolean("hidden").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    disabled: boolean("disabled").notNull().default(false),
    epgChannelId: varchar("epg_channel_id", { length: 255 }),
    epgMatchType: varchar("epg_match_type", { length: 30 }),
    epgStatus: varchar("epg_status", { length: 30 }),
    outputStatus: varchar("output_status", { length: 20 }),
    qualityScore: real("quality_score"),
    primaryStreamId: uuid("primary_stream_id"),
    mergedFromIds: text("merged_from_ids"),
    mergeMethod: varchar("merge_method", { length: 20 }),
    conflictNote: text("conflict_note"),
    lastMergedAt: timestamp("last_merged_at", { withTimezone: true }),
    // --- Safe Operations expand columns (T017). Single lifecycle source of
    // truth. Compatibility booleans (hidden/disabled/outputStatus) remain
    // readable during transition; new writes originate from lifecycle. ---
    lifecycle: varchar("lifecycle", { length: 20 }).notNull().default("active"),
    lifecycleReason: varchar("lifecycle_reason", { length: 500 }),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    stableKey: varchar("stable_key", { length: 255 }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("canonical_name_idx").on(t.standardName),
    index("canonical_group_idx").on(t.standardGroup),
    index("canonical_epg_status_idx").on(t.epgStatus),
    index("canonical_output_status_idx").on(t.outputStatus),
    index("canonical_lifecycle_idx").on(t.lifecycle),
    index("canonical_stable_key_idx").on(t.stableKey),
  ],
);
