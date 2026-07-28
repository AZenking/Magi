import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export const xmltvSources = pgTable("xmltv_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  headers: jsonb("headers").$type<Record<string, string>>(),
  enabled: boolean("enabled").notNull().default(true),
  role: varchar("role", { length: 20 }).notNull().default("primary"),
  priority: integer("priority").notNull().default(100),
  participateInOutput: boolean("participate_in_output").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  qualityScore: real("quality_score"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: varchar("last_sync_status", { length: 20 }),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  checkStatus: varchar("check_status", { length: 20 }),
  checkResponseTime: integer("check_response_time"),
  checkError: text("check_error"),
  // --- Safe Operations expand columns (T017). ---
  freshnessThresholdMinutes: integer("freshness_threshold_minutes").notNull().default(1440),
  lastContentFingerprint: varchar("last_content_fingerprint", { length: 80 }),
  version: integer("version").notNull().default(1),
  ...timestamps,
});
