/**
 * OperationChangeSet domain model (T021).
 *
 * Framework-agnostic state machine for the unified high-risk operation
 * protocol (research §1, data-model.md). Pure rules — no NestJS/Drizzle/BullMQ.
 */
import type {
  ChangeSetStatus,
  OperationKind,
  OperationScopeType,
} from "@magi/types";

export interface OperationChangeSet {
  readonly id: string;
  readonly kind: OperationKind;
  status: ChangeSetStatus;
  readonly scopeType: OperationScopeType;
  readonly scopeId: string;
  readonly sourceId: string | null;
  readonly inputFingerprint: string;
  readonly expiresAt: Date;
  version: number;
  readonly requestedBy: string;
  prepareTaskId: string | null;
  applyTaskId: string | null;
}

/** Allowed transitions (data-model.md state machine). */
const TRANSITIONS: Record<ChangeSetStatus, readonly ChangeSetStatus[]> = {
  preparing: ["ready", "failed"],
  ready: ["applying", "stale", "cancelled", "expired"],
  applying: ["applied", "failed"],
  applied: [],
  failed: [],
  stale: [],
  cancelled: [],
  expired: [],
};

export class OperationChangeSetModel {
  constructor(private readonly cs: OperationChangeSet) {}

  canTransition(to: ChangeSetStatus): boolean {
    return TRANSITIONS[this.cs.status].includes(to);
  }

  /** Only a `ready` change set may be applied. */
  canApply(): boolean {
    return this.cs.status === "ready" && !this.isExpired();
  }

  isExpired(now: Date = new Date()): boolean {
    return this.cs.expiresAt.getTime() <= now.getTime();
  }

  /** Scope key for the operation lease mutex (data-model.md OperationLease). */
  scopeKey(): string {
    return `${this.cs.scopeType}:${this.cs.scopeId}`;
  }
}

export type { OperationChangeSet as OperationChangeSetEntity };
