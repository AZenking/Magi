/**
 * SourceImportSnapshot Drizzle repository (T024).
 *
 * Manages the immutable staging input shared by preview and apply. Snapshot
 * items are written in a single batch; reads are append-only.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "./connection";
import { sourceImportSnapshots, sourceImportSnapshotItems } from "./schema";

export interface SnapshotRow {
  id: string;
  sourceId: string;
  sourceType: string;
  contentFingerprint: string;
  sourceVersion: number;
  status: string;
  itemCount: number;
  parserVersion: string;
  preparedTaskId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

function toDomain(row: typeof sourceImportSnapshots.$inferSelect): SnapshotRow {
  return { ...row };
}

export class SourceImportSnapshotRepository {
  async findById(id: string): Promise<SnapshotRow | null> {
    const [row] = await db.select().from(sourceImportSnapshots).where(eq(sourceImportSnapshots.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(data: Omit<SnapshotRow, "id" | "createdAt">): Promise<SnapshotRow> {
    const [row] = await db
      .insert(sourceImportSnapshots)
      .values({
        sourceId: data.sourceId,
        sourceType: data.sourceType,
        contentFingerprint: data.contentFingerprint,
        sourceVersion: data.sourceVersion,
        status: data.status,
        itemCount: data.itemCount,
        parserVersion: data.parserVersion,
        preparedTaskId: data.preparedTaskId,
        expiresAt: data.expiresAt,
      })
      .returning();
    return toDomain(row!);
  }

  async updateStatus(id: string, status: string, itemCount?: number): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (itemCount !== undefined) patch.itemCount = itemCount;
    await db.update(sourceImportSnapshots).set(patch).where(eq(sourceImportSnapshots.id, id));
  }

  async findItems(snapshotId: string): Promise<(typeof sourceImportSnapshotItems.$inferSelect)[]> {
    return db
      .select()
      .from(sourceImportSnapshotItems)
      .where(eq(sourceImportSnapshotItems.snapshotId, snapshotId))
      .orderBy(sourceImportSnapshotItems.itemOrder);
  }

  async createItems(
    items: (Omit<
      typeof sourceImportSnapshotItems.$inferInsert,
      "id"
    >)[],
  ): Promise<void> {
    if (items.length === 0) return;
    await db.insert(sourceImportSnapshotItems).values(items);
  }

  /** Reference-safe: only delete if no change set references this snapshot. */
  async deleteIfUnreferenced(id: string, referencedByChangeSet: boolean): Promise<boolean> {
    if (referencedByChangeSet) return false;
    const result = await db.delete(sourceImportSnapshots).where(eq(sourceImportSnapshots.id, id)).returning();
    return result.length > 0;
  }

  /** Count items by collision status (duplicate-identity detection). */
  async countCollisionGroups(snapshotId: string): Promise<number> {
    const rows = await db
      .select({ identity: sourceImportSnapshotItems.channelIdentity, n: sql<number>`count(*)::int` })
      .from(sourceImportSnapshotItems)
      .where(eq(sourceImportSnapshotItems.snapshotId, snapshotId))
      .groupBy(sourceImportSnapshotItems.channelIdentity);
    return rows.filter((r) => r.n > 1).length;
  }
}
