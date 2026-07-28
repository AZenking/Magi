/**
 * OperationLease (T015).
 *
 * Persistent business mutex for mutually exclusive operations on a scope
 * (data-model.md). scopeKey is the primary key (e.g. `source:{id}`).
 * Two-minute TTL by default; heartbeat renewed every 30s. An expired lease is
 * reassigned only after confirming its referenced task is not active.
 */
import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const operationLeases = pgTable(
  "operation_leases",
  {
    scopeKey: varchar("scope_key", { length: 120 }).primaryKey(),
    operationKind: varchar("operation_kind", { length: 40 }).notNull(),
    taskId: uuid("task_id"),
    changeSetId: uuid("change_set_id"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("operation_lease_expires_idx").on(t.expiresAt)],
);
