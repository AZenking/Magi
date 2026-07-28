/**
 * AppendAuditEventUseCase (T098).
 *
 * Appends an audit event + enqueues an outbox event through one transactional
 * writer (research §15). Redacts persisted summaries and operator reasons.
 */
import type { AuditEvent } from "@/domain/audit";
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

export interface AuditEventWriter {
  appendWithOutbox(
    data: Omit<AuditEvent, "id" | "occurredAt">,
  ): Promise<AuditEvent>;
}

export class AppendAuditEventUseCase {
  constructor(private readonly writer: AuditEventWriter) {}

  async execute(input: AppendAuditInput): Promise<{ auditEventId: string }> {
    const redactedSummary = input.summary ? redact(input.summary) : null;
    const redactedReason = input.reason
      ? redact({ reason: input.reason.slice(0, 500) }).reason
      : null;
    const event = await this.writer.appendWithOutbox({
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
      reason: redactedReason,
    });
    return { auditEventId: event.id };
  }
}
