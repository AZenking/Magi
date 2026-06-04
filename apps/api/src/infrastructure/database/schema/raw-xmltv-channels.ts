import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { xmltvSources } from "./xmltv-sources";

export const rawXmltvChannels = pgTable(
  "raw_xmltv_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => xmltvSources.id, { onDelete: "cascade" }),
    xmltvId: varchar("xmltv_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    icon: text("icon"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("raw_xmltv_source_idx").on(t.sourceId)],
);
