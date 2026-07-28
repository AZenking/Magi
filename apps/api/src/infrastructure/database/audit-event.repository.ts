/**
 * AuditEvent Drizzle repository (T025).
 *
 * Append-only writes (research §15, data-model.md). `append` is called within
 * the same transaction as the business mutation and OutboxEvent write.
 */
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import type { IAuditRepository } from "@/domain/audit";
import type { AuditEvent, AuditResult } from "@/domain/audit";
import { db } from "./connection";
import { auditEvents } from "./schema";

function toDomain(row: typeof auditEvents.$inferSelect): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    actorType: row.actorType as AuditEvent["actorType"],
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    displayName: row.displayName,
    result: row.result as AuditResult,
    requestId: row.requestId,
    taskId: row.taskId,
    parentTaskId: row.parentTaskId,
    changeSetId: row.changeSetId,
    recoveryPointId: row.recoveryPointId,
    summary: row.summary as Record<string, unknown> | null,
    reason: row.reason,
  };
}

export class AuditEventRepository implements IAuditRepository {
  async append(data: Omit<AuditEvent, "id" | "occurredAt">): Promise<AuditEvent> {
    const [row] = await db
      .insert(auditEvents)
      .values({
        actorType: data.actorType,
        actorId: data.actorId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        displayName: data.displayName,
        result: data.result,
        requestId: data.requestId,
        taskId: data.taskId,
        parentTaskId: data.parentTaskId,
        changeSetId: data.changeSetId,
        recoveryPointId: data.recoveryPointId,
        summary: data.summary,
        reason: data.reason,
      })
      .returning();
    return toDomain(row!);
  }

  async findById(id: string): Promise<AuditEvent | null> {
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findAll(params: {
    page: number;
    pageSize: number;
    action?: string;
    result?: AuditResult;
    targetType?: string;
    targetId?: string;
    taskId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ items: AuditEvent[]; total: number }> {
    const conds = [];
    if (params.action) conds.push(eq(auditEvents.action, params.action));
    if (params.result) conds.push(eq(auditEvents.result, params.result));
    if (params.targetType) conds.push(eq(auditEvents.targetType, params.targetType));
    if (params.targetId) conds.push(eq(auditEvents.targetId, params.targetId));
    if (params.taskId) conds.push(eq(auditEvents.taskId, params.taskId));
    if (params.from) conds.push(gte(auditEvents.occurredAt, params.from));
    if (params.to) conds.push(lte(auditEvents.occurredAt, params.to));
    const where = conds.length > 0 ? and(...conds) : undefined;
    const [items, countResult] = await Promise.all([
      db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.occurredAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(auditEvents).where(where),
    ]);
    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findByChangeSet(changeSetId: string): Promise<AuditEvent[]> {
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.changeSetId, changeSetId));
    return rows.map(toDomain);
  }

  async findByRecoveryPoint(recoveryPointId: string): Promise<AuditEvent[]> {
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.recoveryPointId, recoveryPointId));
    return rows.map(toDomain);
  }
}
