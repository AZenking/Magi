/**
 * AuditEvent (T016).
 *
 * Append-only audit log (data-model.md). `summary` is redacted JSON (counts and
 * changed field names — never secrets). Corrections create a new event; rows
 * are never updated or deleted by the application (retention cleanup excludes
 * audit entirely).
 */
import { pgTable, uuid, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    actorType: varchar("actor_type", { length: 20 }).notNull(), // user | schedule | system
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 60 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    result: varchar("result", { length: 20 }).notNull(), // accepted|succeeded|failed|skipped|cancelled
    requestId: varchar("request_id", { length: 120 }),
    taskId: uuid("task_id"),
    parentTaskId: uuid("parent_task_id"),
    changeSetId: uuid("change_set_id"),
    recoveryPointId: uuid("recovery_point_id"),
    summary: jsonb("summary"),
    reason: varchar("reason", { length: 500 }),
  },
  (t) => [
    index("audit_target_idx").on(t.targetType, t.targetId),
    index("audit_action_idx").on(t.action),
    index("audit_result_idx").on(t.result),
    index("audit_task_idx").on(t.taskId),
    index("audit_change_set_idx").on(t.changeSetId),
    index("audit_occurred_at_idx").on(t.occurredAt),
  ],
);
