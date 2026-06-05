import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { xmltvSources } from "./xmltv-sources";

export const programmes = pgTable(
  "programmes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => xmltvSources.id, { onDelete: "cascade" }),
    xmltvChannelId: varchar("xmltv_channel_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 512 }),
    subTitle: varchar("sub_title", { length: 512 }),
    desc: text("desc"),
    category: varchar("category", { length: 255 }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    stopAt: timestamp("stop_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("programmes_channel_idx").on(t.xmltvChannelId),
    index("programmes_time_idx").on(t.startAt, t.stopAt),
    index("programmes_source_idx").on(t.sourceId),
  ],
);
