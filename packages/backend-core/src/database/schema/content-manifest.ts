import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton revision row for the public TV content projection.
 *
 * The revisions are deliberately independent from row timestamps: XMLTV
 * refreshes replace programme rows and channel composition can touch multiple
 * tables, so clients need one stable invalidation token per content family.
 */
export const contentManifest = pgTable("content_manifest", {
  id: integer("id").primaryKey().default(1),
  catalogRevision: integer("catalog_revision").notNull().default(1),
  epgRevision: integer("epg_revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
