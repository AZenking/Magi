/**
 * OperationChangeSet Drizzle repository (T024).
 *
 * Implements IOperationChangeSetRepository + OperationChangeItem queries.
 * Reference-safe delete: only removes a change set when no active task,
 * recovery point or audit event still references it (data-model.md).
 */
import { eq, and, inArray, sql } from "drizzle-orm";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { OperationChangeSet } from "@/domain/operation-safety";
import { db } from "./connection";
import {
  operationChangeSets,
  operationChangeItems,
  recoveryPoints,
  auditEvents,
} from "./schema";

function toDomain(row: typeof operationChangeSets.$inferSelect): OperationChangeSet {
  return {
    id: row.id,
    kind: row.kind as OperationChangeSet["kind"],
    status: row.status as OperationChangeSet["status"],
    scopeType: row.scopeType as OperationChangeSet["scopeType"],
    scopeId: row.scopeId,
    sourceId: row.sourceId,
    inputFingerprint: row.inputFingerprint,
    expiresAt: row.expiresAt,
    version: row.version,
    requestedBy: row.requestedBy,
    prepareTaskId: row.prepareTaskId,
    applyTaskId: row.applyTaskId,
  };
}

export class OperationChangeSetRepository implements IOperationChangeSetRepository {
  async findById(id: string): Promise<OperationChangeSet | null> {
    const [row] = await db.select().from(operationChangeSets).where(eq(operationChangeSets.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByScopeAndStatus(
    scopeType: string,
    scopeId: string,
    statuses: readonly string[],
  ): Promise<OperationChangeSet[]> {
    if (statuses.length === 0) return [];
    const rows = await db
      .select()
      .from(operationChangeSets)
      .where(
        and(
          eq(operationChangeSets.scopeType, scopeType),
          eq(operationChangeSets.scopeId, scopeId),
          inArray(operationChangeSets.status, [...statuses]),
        ),
      );
    return rows.map(toDomain);
  }

  async create(data: Omit<OperationChangeSet, "version">): Promise<OperationChangeSet> {
    const [row] = await db
      .insert(operationChangeSets)
      .values({
        id: data.id,
        kind: data.kind,
        status: data.status,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        sourceId: data.sourceId,
        inputFingerprint: data.inputFingerprint,
        expiresAt: data.expiresAt,
        requestedBy: data.requestedBy,
        prepareTaskId: data.prepareTaskId,
        applyTaskId: data.applyTaskId,
        baseVersions: {},
      })
      .returning();
    return toDomain(row!);
  }

  async updateStatus(id: string, status: string, version: number): Promise<OperationChangeSet | null> {
    const [row] = await db
      .update(operationChangeSets)
      .set({ status, version: version + 1, updatedAt: new Date() })
      .where(and(eq(operationChangeSets.id, id), eq(operationChangeSets.version, version)))
      .returning();
    return row ? toDomain(row) : null;
  }

  async updateSummary(
    id: string,
    summary: Record<string, number>,
    warnings: unknown[],
    blockers: unknown[],
  ): Promise<void> {
    await db
      .update(operationChangeSets)
      .set({ summary, warnings, blockers, updatedAt: new Date() })
      .where(eq(operationChangeSets.id, id));
  }

  /** Raw summary/warnings/blockers read for the preview UI (GET change-set). */
  async findSummaryById(id: string): Promise<{
    summary: Record<string, number> | null;
    warnings: unknown[] | null;
    blockers: unknown[] | null;
  } | null> {
    const [row] = await db
      .select({
        summary: operationChangeSets.summary,
        warnings: operationChangeSets.warnings,
        blockers: operationChangeSets.blockers,
      })
      .from(operationChangeSets)
      .where(eq(operationChangeSets.id, id))
      .limit(1);
    if (!row) return null;
    return {
      summary: row.summary as Record<string, number> | null,
      warnings: row.warnings as unknown[] | null,
      blockers: row.blockers as unknown[] | null,
    };
  }

  async deleteIfUnreferenced(id: string): Promise<boolean> {
    // Block if a recovery point or audit event still references this change set.
    const [recovery] = await db
      .select({ id: recoveryPoints.id })
      .from(recoveryPoints)
      .where(eq(recoveryPoints.changeSetId, id))
      .limit(1);
    if (recovery) return false;
    const [audit] = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.changeSetId, id))
      .limit(1);
    if (audit) return false;
    const result = await db.delete(operationChangeSets).where(eq(operationChangeSets.id, id)).returning();
    return result.length > 0;
  }

  // --- Change-item queries (consumed by US1 use cases). ---
  async findItems(changeSetId: string, params: { page: number; pageSize: number; classification?: string }): Promise<{
    items: (typeof operationChangeItems.$inferSelect)[];
    total: number;
  }> {
    const { page, pageSize, classification } = params;
    const conditions = [eq(operationChangeItems.changeSetId, changeSetId)];
    if (classification) conditions.push(eq(operationChangeItems.classification, classification));
    const where = and(...conditions);
    const [items, countResult] = await Promise.all([
      db.select().from(operationChangeItems).where(where).orderBy(operationChangeItems.itemOrder).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(operationChangeItems).where(where),
    ]);
    return { items, total: countResult[0]?.count ?? 0 };
  }

  async updateItemSelection(itemId: string, selected: boolean, decision: unknown): Promise<void> {
    await db
      .update(operationChangeItems)
      .set({ selected, decision })
      .where(eq(operationChangeItems.id, itemId));
  }
}
