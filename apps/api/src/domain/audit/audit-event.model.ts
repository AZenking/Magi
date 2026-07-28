/**
 * AuditEvent domain model (T023).
 *
 * Append-only audit log entity (data-model.md AuditEvent). Corrections create a
 * new event; rows are never updated. `summary` is redacted — counts and changed
 * field names only, never secrets (constitution VII).
 */
export type ActorType = "user" | "schedule" | "system";
export type AuditResult = "accepted" | "succeeded" | "failed" | "skipped" | "cancelled";

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly displayName: string | null;
  readonly result: AuditResult;
  readonly requestId: string | null;
  readonly taskId: string | null;
  readonly parentTaskId: string | null;
  readonly changeSetId: string | null;
  readonly recoveryPointId: string | null;
  /** Redacted: counts and changed field names, not secret values. */
  readonly summary: Record<string, unknown> | null;
  readonly reason: string | null;
}

export class AuditEventModel {
  constructor(private readonly event: AuditEvent) {}

  /** Audit events are append-only — this is always false for existing rows. */
  canBeCorrected(): boolean {
    return false;
  }

  /** Whether this event references a recoverable operation (FR-010). */
  linksRecovery(): boolean {
    return this.event.recoveryPointId != null;
  }

  toObject(): AuditEvent {
    return { ...this.event };
  }
}
