/**
 * CanonicalChannelMember (T017).
 *
 * Normalized membership replacing `mergedFromIds` (research §3,
 * data-model.md). Connects a stable canonical channel to one or more source
 * channels by stable identity. A canonical channel may remain without active
 * members when it has manual streams or is trashed.
 */
import { pgTable, uuid, varchar, boolean, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const canonicalChannelMembers = pgTable(
  "canonical_channel_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalChannelId: uuid("canonical_channel_id").notNull(),
    sourceChannelId: uuid("source_channel_id").notNull(),
    channelIdentity: varchar("channel_identity", { length: 255 }).notNull(),
    membershipSource: varchar("membership_source", { length: 20 }).notNull(), // automatic|manual|migrated
    active: boolean("active").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("canonical_member_pair_idx").on(t.canonicalChannelId, t.sourceChannelId),
    index("canonical_member_active_source_idx").on(t.sourceChannelId, t.active),
    index("canonical_member_canonical_idx").on(t.canonicalChannelId),
  ],
);
