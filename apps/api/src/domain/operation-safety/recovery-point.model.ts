/**
 * RecoveryPoint domain model (T021).
 *
 * Pre-operation snapshot state machine (data-model.md RecoveryPoint). A
 * recovery point is created before any high-risk apply; if creation fails the
 * apply must not proceed (FR-018).
 */
import type { OperationKind, OperationScopeType } from "@magi/types";
import type { RecoveryPointStatus } from "@magi/types";

export interface RecoveryPoint {
  readonly id: string;
  status: RecoveryPointStatus;
  readonly operationKind: OperationKind;
  readonly scopeType: OperationScopeType;
  readonly scopeId: string;
  readonly changeSetId: string | null;
  readonly taskId: string | null;
  readonly schemaVersion: number;
  readonly itemCount: number;
  readonly checksum: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

const RECOVERY_TRANSITIONS: Record<RecoveryPointStatus, readonly RecoveryPointStatus[]> = {
  creating: ["ready", "invalid"],
  ready: ["restoring", "invalid", "expired"],
  restoring: ["restored", "invalid"],
  restored: [],
  invalid: [],
  expired: [],
};

export class RecoveryPointModel {
  constructor(private readonly rp: RecoveryPoint) {}

  canTransition(to: RecoveryPointStatus): boolean {
    return RECOVERY_TRANSITIONS[this.rp.status].includes(to);
  }

  /** A recovery point must be `ready` and non-expired to be restored. */
  canRestore(now: Date = new Date()): boolean {
    if (this.rp.status !== "ready") return false;
    if (this.rp.expiresAt && this.rp.expiresAt.getTime() <= now.getTime()) return false;
    return true;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.rp.expiresAt !== null && this.rp.expiresAt.getTime() <= now.getTime();
  }
}

export type { RecoveryPoint as RecoveryPointEntity };
