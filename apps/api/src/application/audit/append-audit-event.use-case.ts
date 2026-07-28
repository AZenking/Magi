/**
 * AppendAuditEventUseCase (T098).
 *
 * Appends an audit event + enqueues an outbox event in the same logical
 * transaction (research §15). The caller is responsible for wrapping both in a
 * DB transaction; this use case produces both writes. Redacts the summary.
 */
import type { IAuditRepository } from "@/domain/audit";
import type { OutboxRepository } from "@/infrastructure/database/outbox.repository";
import { redact } from "@/application/backup/backup-redactor";
import type { ActorType, AuditResult } from "@/domain/audit";

export interface AppendAuditInput {
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly displayName?: string | null;
  readonly result: AuditResult;
  readonly requestId?: string | null;
  readonly taskId?: string | null;
  readonly parentTaskId?: string | null;
  readonly changeSetId?: string | null;
  readonly recoveryPointId?: string | null;
  readonly summary?: Record<string, unknown> | null;
  readonly reason?: string | null;
}

export class AppendAuditEventUseCase {
  constructor(
    private readonly auditRepo: IAuditRepository,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  async execute(input: AppendAuditInput): Promise<{ auditEventId: string }> {
    const redactedSummary = input.summary ? redact(input.summary) : null;
    const event = await this.auditRepo.append({
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      displayName: input.displayName ?? null,
      result: input.result,
      requestId: input.requestId ?? null,
      taskId: input.taskId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      changeSetId: input.changeSetId ?? null,
      recoveryPointId: input.recoveryPointId ?? null,
      summary: redactedSummary,
      reason: input.reason ?? null,
    });
    // Enqueue the outbox event in the same transaction (caller wraps).
    await this.outboxRepo.enqueue({
      topic: `audit.${input.action}`,
      aggregateType: input.targetType,
      aggregateId: input.targetId,
      payload: { auditEventId: event.id, result: input.result },
      requestId: input.requestId,
      taskId: input.taskId,
    });
    return { auditEventId: event.id };
  }
}
