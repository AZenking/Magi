import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./helpers";
import { canonicalChannels } from "./canonical-channels";
import { xmltvSources } from "./xmltv-sources";

export const canonicalEpgBindings = pgTable(
  "canonical_epg_bindings",
  {
    canonicalChannelId: uuid("canonical_channel_id")
      .primaryKey()
      .references(() => canonicalChannels.id, { onDelete: "cascade" }),
    xmltvSourceId: uuid("xmltv_source_id").references(() => xmltvSources.id, {
      onDelete: "restrict",
    }),
    xmltvChannelId: varchar("xmltv_channel_id", { length: 255 }),
    status: varchar("status", { length: 30 }).notNull().default("unmatched"),
    matchType: varchar("match_type", { length: 30 }),
    locked: boolean("locked").notNull().default(false),
    decisionReason: varchar("decision_reason", { length: 500 }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("canonical_epg_binding_source_channel_idx").on(
      t.xmltvSourceId,
      t.xmltvChannelId,
    ),
    index("canonical_epg_binding_status_idx").on(t.status),
    check(
      "canonical_epg_binding_matched_fields_check",
      sql`(${t.status} not in ('matched_manual', 'matched_auto')) or (${t.xmltvSourceId} is not null and ${t.xmltvChannelId} is not null)`,
    ),
  ],
);
