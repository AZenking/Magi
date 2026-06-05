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
    queueName: varchar("queue_name", { length: 50 }),
    jobId: varchar("job_id", { length: 50 }),
    jobName: varchar("job_name", { length: 50 }),
    attemptsMade: integer("attempts_made").notNull().default(0),
    processedOn: timestamp("processed_on", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sync_logs_source_idx").on(t.sourceId, t.sourceType),
    index("sync_logs_status_idx").on(t.status),
    index("sync_logs_queue_name_idx").on(t.queueName),
  ],
);
