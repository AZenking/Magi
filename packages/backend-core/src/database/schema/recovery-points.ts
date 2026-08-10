/**
 * RecoveryPoint + RecoveryPointItem (T016).
 *
 * Per-object pre-operation snapshot used to preview and roll back high-risk
 * applies (data-model.md). Items carry the full state required to restore one
 * object; reference ordering is explicit so parents restore before children.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const recoveryPoints = pgTable(
  "recovery_points",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: varchar("status", { length: 20 }).notNull(), // creating|ready|restoring|restored|invalid|expired
    operationKind: varchar("operation_kind", { length: 40 }).notNull(),
    scopeType: varchar("scope_type", { length: 20 }).notNull(),
    scopeId: uuid("scope_id").notNull(),
    changeSetId: uuid("change_set_id"),
    taskId: uuid("task_id"),
    schemaVersion: integer("schema_version").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    checksum: varchar("checksum", { length: 80 }).notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("recovery_point_scope_idx").on(t.scopeType, t.scopeId),
    index("recovery_point_change_set_idx").on(t.changeSetId),
    index("recovery_point_status_idx").on(t.status),
  ],
);

export const recoveryPointItems = pgTable(
  "recovery_point_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recoveryPointId: uuid("recovery_point_id")
      .notNull()
      .references(() => recoveryPoints.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id"),
    entityVersion: integer("entity_version"),
    payload: jsonb("payload").notNull(),
    itemOrder: integer("item_order").notNull(),
    checksum: varchar("checksum", { length: 80 }).notNull(),
  },
  (t) => [index("recovery_item_point_idx").on(t.recoveryPointId)],
);
