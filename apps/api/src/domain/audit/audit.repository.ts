/**
 * Audit repository port (T023).
 *
 * Append-only writes; queries for list/detail. Implementations write AuditEvent
 * in the same transaction as the business mutation and OutboxEvent (research §15).
 */
import type { AuditEvent, AuditResult } from "./audit-event.model";

export interface IAuditRepository {
  /** Append a new event. Never updates — corrections create a new event. */
  append(data: Omit<AuditEvent, "id" | "occurredAt">): Promise<AuditEvent>;
  findById(id: string): Promise<AuditEvent | null>;
  findAll(params: {
    page: number;
    pageSize: number;
    action?: string;
    result?: AuditResult;
    targetType?: string;
    targetId?: string;
    taskId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ items: AuditEvent[]; total: number }>;
  /** Events linked to a change set / recovery point (restore entry points). */
  findByChangeSet(changeSetId: string): Promise<AuditEvent[]>;
  findByRecoveryPoint(recoveryPointId: string): Promise<AuditEvent[]>;
}
