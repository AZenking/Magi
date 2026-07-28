/**
 * Drizzle operation-execution repository adapter (T041).
 *
 * Implements IOperationExecutionRepository (T027 port) + ICleanupPort (T041)
 * against the shared schema. Infrastructure layer — imports Drizzle, which the
 * Worker application layer never imports (constitution III).
 */
import { eq, and, lt, inArray } from "drizzle-orm";
import type { IOperationExecutionRepository } from "@/domain/operation-safety";
import type { ICleanupPort } from "@/application/operation-safety/cleanup-operation-state.use-case";
import { db } from "../../db";
import {
  operationChangeSets,
  sourceImportSnapshots,
  idempotencyRecords,
  operationLeases,
  recoveryPoints,
  auditEvents,
  sourceImportSnapshotItems,
  operationChangeItems,
  syncLogs,
} from "../../schema";

const TERMINAL_STATUSES = ["applied", "failed", "stale", "cancelled", "expired"];

export class DrizzleOperationExecutionRepository
  implements IOperationExecutionRepository, ICleanupPort
{
  // --- IOperationExecutionRepository ---
  async loadChangeSetForApply(changeSetId: string) {
    const [row] = await db
      .select({
        id: operationChangeSets.id,
        inputFingerprint: operationChangeSets.inputFingerprint,
        status: operationChangeSets.status,
        expiresAt: operationChangeSets.expiresAt,
      })
      .from(operationChangeSets)
      .where(eq(operationChangeSets.id, changeSetId))
      .limit(1);
    return row ?? null;
  }

  async loadSnapshotItems(snapshotId: string) {
    const rows = await db
      .select({
        channelIdentity: sourceImportSnapshotItems.channelIdentity,
        collisionOrdinal: sourceImportSnapshotItems.collisionOrdinal,
        itemOrder: sourceImportSnapshotItems.itemOrder,
        payload: sourceImportSnapshotItems.payload,
      })
      .from(sourceImportSnapshotItems)
      .where(eq(sourceImportSnapshotItems.snapshotId, snapshotId))
      .orderBy(sourceImportSnapshotItems.itemOrder);
    return rows;
  }

  async finalizeChangeSet(changeSetId: string, status: string, version: number): Promise<boolean> {
    const result = await db
      .update(operationChangeSets)
      .set({ status, version: version + 1, updatedAt: new Date() })
      .where(
        and(eq(operationChangeSets.id, changeSetId), eq(operationChangeSets.version, version)),
      )
      .returning();
    return result.length > 0;
  }

  async acquireLease(scopeKey: string, taskId: string, ttlMs: number) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const [row] = await db
      .insert(operationLeases)
      .values({ scopeKey, operationKind: "m3u_sync", taskId, acquiredAt: now, expiresAt, heartbeatAt: now })
      .onConflictDoNothing({ target: operationLeases.scopeKey })
      .returning();
    if (row) return { acquired: true, ownerTaskId: null };
    const [existing] = await db.select().from(operationLeases).where(eq(operationLeases.scopeKey, scopeKey)).limit(1);
    return { acquired: false, ownerTaskId: existing?.taskId ?? null };
  }

  async heartbeatLease(scopeKey: string, taskId: string): Promise<void> {
    const now = new Date();
    await db
      .update(operationLeases)
      .set({ heartbeatAt: now, expiresAt: new Date(now.getTime() + 2 * 60 * 1000) })
      .where(and(eq(operationLeases.scopeKey, scopeKey), eq(operationLeases.taskId, taskId)));
  }

  // --- ICleanupPort ---
  async expireTerminalChangeSets(cutoff: Date): Promise<number> {
    // Find terminal change sets older than cutoff.
    const candidates = await db
      .select({ id: operationChangeSets.id })
      .from(operationChangeSets)
      .where(
        and(
          lt(operationChangeSets.updatedAt, cutoff),
          inArray(operationChangeSets.status, TERMINAL_STATUSES),
        ),
      );
    let deleted = 0;
    for (const c of candidates) {
      // Block if referenced by recovery point or audit event.
      const [rp] = await db.select({ id: recoveryPoints.id }).from(recoveryPoints).where(eq(recoveryPoints.changeSetId, c.id)).limit(1);
      if (rp) continue;
      const [ae] = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.changeSetId, c.id)).limit(1);
      if (ae) continue;
      await db.delete(operationChangeItems).where(eq(operationChangeItems.changeSetId, c.id));
      await db.delete(operationChangeSets).where(eq(operationChangeSets.id, c.id));
      deleted++;
    }
    return deleted;
  }

  async expireSnapshots(cutoff: Date): Promise<number> {
    const candidates = await db
      .select({ id: sourceImportSnapshots.id })
      .from(sourceImportSnapshots)
      .where(lt(sourceImportSnapshots.createdAt, cutoff));
    let deleted = 0;
    for (const s of candidates) {
      // Block if a change set still references this snapshot.
      const [cs] = await db.select({ id: operationChangeSets.id }).from(operationChangeSets).where(eq(operationChangeSets.snapshotId, s.id)).limit(1);
      if (cs) continue;
      await db.delete(sourceImportSnapshotItems).where(eq(sourceImportSnapshotItems.snapshotId, s.id));
      await db.delete(sourceImportSnapshots).where(eq(sourceImportSnapshots.id, s.id));
      deleted++;
    }
    return deleted;
  }

  async expireIdempotencyRecords(now: Date): Promise<number> {
    const result = await db.delete(idempotencyRecords).where(lt(idempotencyRecords.expiresAt, now)).returning();
    return result.length;
  }

  async reclaimExpiredLeases(now: Date): Promise<number> {
    const expired = await db.select().from(operationLeases).where(lt(operationLeases.expiresAt, now));
    let reclaimed = 0;
    for (const lease of expired) {
      if (!lease.taskId) { await db.delete(operationLeases).where(eq(operationLeases.scopeKey, lease.scopeKey)); reclaimed++; continue; }
      // Confirm the referenced task is not active before reclaiming.
      const [task] = await db.select({ status: syncLogs.status }).from(syncLogs).where(eq(syncLogs.id, lease.taskId)).limit(1);
      const isActive = task?.status === "pending" || task?.status === "running";
      if (!isActive) {
        await db.delete(operationLeases).where(eq(operationLeases.scopeKey, lease.scopeKey));
        reclaimed++;
      }
    }
    return reclaimed;
  }
}
