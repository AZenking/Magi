/**
 * ConfigBackup (T018).
 *
 * Backup metadata only — bytes live in `BackupObjectStorage` at an opaque
 * `storageRef` that is never returned to clients (research §18,
 * data-model.md). 30-day default retention; expiry removes the object before
 * marking metadata expired.
 */
import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const configBackups = pgTable(
  "config_backups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: varchar("status", { length: 20 }).notNull(), // creating|ready|failed|expired
    formatVersion: integer("format_version").notNull(),
    sourceAppVersion: varchar("source_app_version", { length: 60 }),
    scope: jsonb("scope").notNull(),
    capabilities: jsonb("capabilities").notNull(),
    objectCounts: jsonb("object_counts").notNull(),
    checksum: varchar("checksum", { length: 80 }).notNull(),
    storageRef: varchar("storage_ref", { length: 500 }).notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    taskId: uuid("task_id"),
  },
  (t) => [
    index("backup_status_idx").on(t.status),
    index("backup_expires_idx").on(t.expiresAt),
  ],
);
