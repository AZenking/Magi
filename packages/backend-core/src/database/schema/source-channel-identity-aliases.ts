/**
 * SourceChannelIdentityAlias (T017).
 *
 * Preserves identity continuity when upstream IDs or the identity algorithm
 * change (data-model.md). Only one active target per alias; ambiguous aliases
 * become blockers and are never auto-resolved.
 */
import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const sourceChannelIdentityAliases = pgTable(
  "source_channel_identity_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id").notNull(),
    alias: varchar("alias", { length: 255 }).notNull(),
    aliasType: varchar("alias_type", { length: 20 }).notNull(), // upstream|legacy|fingerprint|manual
    sourceChannelId: uuid("source_channel_id").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("identity_alias_source_alias_active_idx").on(t.sourceId, t.alias, t.active),
    index("identity_alias_source_idx").on(t.sourceId),
    index("identity_alias_target_idx").on(t.sourceChannelId),
  ],
);
