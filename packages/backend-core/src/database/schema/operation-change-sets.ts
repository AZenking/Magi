/**
 * OperationChangeSet + OperationChangeItem (T015).
 *
 * Preview/change-set persistence (data-model.md). Change set holds the
 * per-operation summary; items are the reviewable per-target rows. Items are
 * immutable except `selected` and `decision` while the parent is `ready`.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { sourceImportSnapshots } from "./source-import-snapshots";

export const operationChangeSets = pgTable(
  "operation_change_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: varchar("kind", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    scopeType: varchar("scope_type", { length: 20 }).notNull(),
    scopeId: uuid("scope_id").notNull(),
    sourceId: uuid("source_id"),
    snapshotId: uuid("snapshot_id").references(() => sourceImportSnapshots.id, {
      onDelete: "set null",
    }),
    inputFingerprint: varchar("input_fingerprint", { length: 80 }).notNull(),
    baseVersions: jsonb("base_versions").notNull(),
    summary: jsonb("summary"),
    warnings: jsonb("warnings"),
    blockers: jsonb("blockers"),
    requestedBy: varchar("requested_by", { length: 255 }).notNull(),
    prepareTaskId: uuid("prepare_task_id"),
    applyTaskId: uuid("apply_task_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("change_set_scope_idx").on(t.scopeType, t.scopeId),
    index("change_set_status_idx").on(t.status),
    index("change_set_kind_idx").on(t.kind),
    index("change_set_requested_by_idx").on(t.requestedBy),
  ],
);

export const operationChangeItems = pgTable(
  "operation_change_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changeSetId: uuid("change_set_id")
      .notNull()
      .references(() => operationChangeSets.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id"),
    channelIdentity: varchar("channel_identity", { length: 255 }),
    action: varchar("action", { length: 20 }).notNull(),
    classification: varchar("classification", { length: 30 }),
    before: jsonb("before"),
    after: jsonb("after"),
    changedFields: jsonb("changed_fields"),
    confidence: real("confidence"),
    reasonCode: varchar("reason_code", { length: 60 }),
    selected: boolean("selected").notNull().default(false),
    decision: jsonb("decision"),
    itemOrder: integer("item_order").notNull(),
  },
  (t) => [
    uniqueIndex("change_item_order_idx").on(t.changeSetId, t.itemOrder),
    index("change_item_set_idx").on(t.changeSetId),
    index("change_item_action_idx").on(t.changeSetId, t.action),
    index("change_item_classification_idx").on(t.changeSetId, t.classification),
  ],
);
