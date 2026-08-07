/**
 * OperationChangeSet domain model (T021; 009-m3u-control-plane extends the
 * shape with snapshotId, sourceVersion, summary, warnings, requiresConfirmation
 * and anomalyClassification so the apply use case can enforce FR-016).
 *
 * Framework-agnostic state machine for the unified high-risk operation
 * protocol (research §1, data-model.md). Pure rules — no NestJS/Drizzle/BullMQ.
 */
import type {
  ChangeSetStatus,
  OperationKind,
  OperationScopeType,
} from "@magi/types";

/** Structured warning row produced by the prepare use case (009). */
export interface ChangeWarningRow {
  readonly code: string;
  readonly message: string;
  readonly deletionRatio?: number;
}

/** Anomaly classifier output persisted on the change set (009). */
export interface AnomalyClassificationRow {
  readonly requiresConfirmation: boolean;
  readonly warnings: ReadonlyArray<{
    readonly code: "empty-snapshot" | "deletion-ratio-exceeded";
    readonly message: string;
    readonly deletionRatio: number;
  }>;
}

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
  // --- 009-m3u-control-plane ---
  readonly snapshotId?: string | null;
  readonly sourceVersion?: number | null;
  readonly summary?: Record<string, unknown> | null;
  readonly warnings?: ReadonlyArray<ChangeWarningRow> | null;
  readonly blockers?: ReadonlyArray<ChangeWarningRow> | null;
  readonly requiresConfirmation?: boolean;
  readonly anomalyClassification?: AnomalyClassificationRow | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
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

/**
 * Extract warning codes the operator must confirm before apply (009 T018).
 * Pulls from `warnings` first (rich shape) then falls back to the structured
 * anomalyClassification. Returns the unique, non-null code list.
 */
export function extractWarningCodes(cs: OperationChangeSet): string[] {
  const codes = new Set<string>();
  if (cs.warnings) {
    for (const w of cs.warnings) codes.add(w.code);
  }
  if (cs.anomalyClassification) {
    for (const w of cs.anomalyClassification.warnings) codes.add(w.code);
  }
  return [...codes];
}

export type { OperationChangeSet as OperationChangeSetEntity };
