import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { channels } from "./channels";

export const channelOverrides = pgTable("channel_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id")
    .unique()
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  customName: varchar("custom_name", { length: 255 }),
  customGroup: varchar("custom_group", { length: 255 }),
  customLogo: text("custom_logo"),
  channelNumber: integer("channel_number"),
  hidden: boolean("hidden").notNull().default(false),
  starred: boolean("starred").notNull().default(false),
  manualEpgChannelId: varchar("manual_epg_channel_id", { length: 255 }),
  ...timestamps,
});
