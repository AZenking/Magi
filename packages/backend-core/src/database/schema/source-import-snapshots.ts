/**
 * SourceImportSnapshot + SourceImportSnapshotItem (T015).
 *
 * Immutable staging input shared by preview and apply (data-model.md).
 * Snapshot items use (snapshotId, channelIdentity, collisionOrdinal) and
 * (snapshotId, itemOrder) unique constraints; duplicate identities within a
 * snapshot are numbered by collisionOrdinal and flagged conflict upstream.
 */
import { pgTable, uuid, varchar, jsonb, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export const sourceImportSnapshots = pgTable(
  "source_import_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id").notNull(),
    sourceType: varchar("source_type", { length: 10 }).notNull(), // m3u | xmltv
    contentFingerprint: varchar("content_fingerprint", { length: 80 }).notNull(),
    sourceVersion: integer("source_version").notNull(),
    status: varchar("status", { length: 20 }).notNull(), // preparing | ready | invalid | expired
    itemCount: integer("item_count").notNull().default(0),
    parserVersion: varchar("parser_version", { length: 30 }).notNull(),
    preparedTaskId: uuid("prepared_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("snapshot_source_fingerprint_idx").on(t.sourceId, t.contentFingerprint),
    index("snapshot_source_idx").on(t.sourceId),
    index("snapshot_status_idx").on(t.status),
  ],
);

export const sourceImportSnapshotItems = pgTable(
  "source_import_snapshot_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => sourceImportSnapshots.id, { onDelete: "cascade" }),
    channelIdentity: varchar("channel_identity", { length: 512 }).notNull(),
    collisionOrdinal: integer("collision_ordinal").notNull().default(0),
    itemOrder: integer("item_order").notNull(),
    payload: jsonb("payload").notNull(),
    checksum: varchar("checksum", { length: 80 }).notNull(),
  },
  (t) => [
    uniqueIndex("snapshot_item_identity_idx").on(
      t.snapshotId,
      t.channelIdentity,
      t.collisionOrdinal,
    ),
    uniqueIndex("snapshot_item_order_idx").on(t.snapshotId, t.itemOrder),
    index("snapshot_item_snapshot_idx").on(t.snapshotId),
  ],
);

// `timestamps` not needed — snapshots are immutable and only carry createdAt/expiresAt.
void timestamps;
