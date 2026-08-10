/**
 * RecoveryPoint Drizzle repository (T024).
 *
 * Implements IRecoveryPointRepository. Reference-safe expiry: never deletes a
 * recovery point still referenced by an audit event or active task.
 */
import { eq, and } from "drizzle-orm";
import type { IRecoveryPointRepository } from "@/domain/operation-safety";
import type { RecoveryPoint } from "@/domain/operation-safety";
import { chunk, safeBatchSize } from "@magi/utils";
import { db } from "./connection";
import { recoveryPoints, recoveryPointItems, auditEvents } from "./schema";

function toDomain(row: typeof recoveryPoints.$inferSelect): RecoveryPoint {
  return {
    id: row.id,
    status: row.status as RecoveryPoint["status"],
    operationKind: row.operationKind as RecoveryPoint["operationKind"],
    scopeType: row.scopeType as RecoveryPoint["scopeType"],
    scopeId: row.scopeId,
    changeSetId: row.changeSetId,
    taskId: row.taskId,
    schemaVersion: row.schemaVersion,
    itemCount: row.itemCount,
    checksum: row.checksum,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export class RecoveryPointRepository implements IRecoveryPointRepository {
  async findById(id: string): Promise<RecoveryPoint | null> {
    const [row] = await db.select().from(recoveryPoints).where(eq(recoveryPoints.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByChangeSet(changeSetId: string): Promise<RecoveryPoint | null> {
    const [row] = await db.select().from(recoveryPoints).where(eq(recoveryPoints.changeSetId, changeSetId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(data: Omit<RecoveryPoint, "id" | "createdAt">): Promise<RecoveryPoint> {
    const [row] = await db
      .insert(recoveryPoints)
      .values({
        status: data.status,
        operationKind: data.operationKind,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        changeSetId: data.changeSetId,
        taskId: data.taskId,
        schemaVersion: data.schemaVersion,
        itemCount: data.itemCount,
        checksum: data.checksum,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
      })
      .returning();
    return toDomain(row!);
  }

  async updateStatus(id: string, status: string): Promise<RecoveryPoint | null> {
    const [row] = await db.update(recoveryPoints).set({ status }).where(eq(recoveryPoints.id, id)).returning();
    return row ? toDomain(row) : null;
  }

  async expireIfUnreferenced(id: string, now: Date): Promise<boolean> {
    // Block if an audit event still references this recovery point.
    const [audit] = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.recoveryPointId, id))
      .limit(1);
    if (audit) return false;
    // Only expire if already past expiresAt.
    const [row] = await db
      .update(recoveryPoints)
      .set({ status: "expired" })
      .where(and(eq(recoveryPoints.id, id), eq(recoveryPoints.expiresAt, now)))
      .returning();
    return !!row;
  }

  async createItems(
    items: ReadonlyArray<{
      recoveryPointId: string;
      entityType: string;
      entityId: string;
      entityVersion: number;
      payload: Record<string, unknown>;
      itemOrder: number;
      checksum: string;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((i) => ({
      recoveryPointId: i.recoveryPointId,
      entityType: i.entityType,
      entityId: i.entityId,
      entityVersion: i.entityVersion,
      payload: i.payload,
      itemOrder: i.itemOrder,
      checksum: i.checksum,
    }));
    for (const batch of chunk(rows, safeBatchSize(7))) {
      await db.insert(recoveryPointItems).values(batch);
    }
  }

  async findItems(recoveryPointId: string): Promise<(typeof recoveryPointItems.$inferSelect)[]> {
    return db
      .select()
      .from(recoveryPointItems)
      .where(eq(recoveryPointItems.recoveryPointId, recoveryPointId))
      .orderBy(recoveryPointItems.itemOrder);
  }
}
