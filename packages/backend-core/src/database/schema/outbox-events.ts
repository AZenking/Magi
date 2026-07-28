/**
 * OutboxEvent (T016).
 *
 * Reliable transaction-to-async handoff (data-model.md, research §15).
 * Business mutation, AuditEvent and OutboxEvent are written in the same
 * transaction. Consumers are idempotent by outbox ID. `payload` is redacted.
 */
import { pgTable, uuid, varchar, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topic: varchar("topic", { length: 60 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 40 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    requestId: varchar("request_id", { length: 120 }),
    taskId: uuid("task_id"),
    status: varchar("status", { length: 20 }).notNull(), // pending | published | failed
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("outbox_status_available_idx").on(t.status, t.availableAt),
    index("outbox_aggregate_idx").on(t.aggregateType, t.aggregateId),
    index("outbox_task_idx").on(t.taskId),
  ],
);
