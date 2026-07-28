/**
 * ScheduledJobConfig (T018).
 *
 * Persistent scheduled-job configuration — the source of truth (research §9,
 * data-model.md). Queue scheduler state is a reconciled projection.
 * `overlapPolicy` is `skip`-only in this release but stored as varchar for
 * forward compatibility.
 */
import { pgTable, uuid, varchar, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export const scheduledJobConfigs = pgTable(
  "scheduled_job_configs",
  {
    id: varchar("id", { length: 120 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 500 }),
    taskType: varchar("task_type", { length: 40 }).notNull(),
    scopeType: varchar("scope_type", { length: 20 }),
    scopeId: uuid("scope_id"),
    enabled: boolean("enabled").notNull().default(true),
    intervalMs: integer("interval_ms"),
    cronExpression: varchar("cron_expression", { length: 120 }),
    timeZone: varchar("time_zone", { length: 60 }).notNull(),
    overlapPolicy: varchar("overlap_policy", { length: 20 }).notNull().default("skip"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: varchar("last_status", { length: 20 }),
    lastSkipReason: varchar("last_skip_reason", { length: 120 }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("schedule_task_type_idx").on(t.taskType),
    index("schedule_scope_idx").on(t.scopeType, t.scopeId),
    index("schedule_enabled_next_run_idx").on(t.enabled, t.nextRunAt),
  ],
);
