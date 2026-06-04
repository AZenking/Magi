import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
export const syncLogs = pgTable(
  "sync_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: varchar("source_type", { length: 10 }).notNull(),
    taskType: varchar("task_type", { length: 20 }).notNull().default("sync"),
    sourceId: uuid("source_id").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    progress: integer("progress").notNull().default(0),
    currentStep: varchar("current_step", { length: 20 }),
    executionLog: text("execution_log"),
    importedCount: integer("imported_count").notNull().default(0),
    addedCount: integer("added_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sync_logs_source_idx").on(t.sourceId, t.sourceType),
    index("sync_logs_status_idx").on(t.status),
  ],
);
