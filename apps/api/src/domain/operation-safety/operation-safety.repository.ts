/**
 * Operation-safety repository ports (T021).
 *
 * Interfaces only — implementations live in infrastructure/ (constitution III).
 * Use cases depend on these, never on Drizzle classes.
 */
import type { OperationKind, OperationScopeType } from "@magi/types";
import type { OperationChangeSet } from "./operation-change-set.model";
import type { RecoveryPoint } from "./recovery-point.model";

export interface IOperationChangeSetRepository {
  findById(id: string): Promise<OperationChangeSet | null>;
  findByScopeAndStatus(
    scopeType: OperationScopeType,
    scopeId: string,
    statuses: readonly string[],
  ): Promise<OperationChangeSet[]>;
  create(
    data: Omit<OperationChangeSet, "version">,
  ): Promise<OperationChangeSet>;
  updateStatus(
    id: string,
    status: string,
    version: number,
  ): Promise<OperationChangeSet | null>;
  updateSummary(
    id: string,
    summary: Record<string, unknown>,
    warnings: unknown[],
    blockers: unknown[],
  ): Promise<void>;
  /** Reference-safe delete: only when no active task/recovery/audit references it. */
  deleteIfUnreferenced(id: string): Promise<boolean>;
}

export interface IOperationLeaseRepository {
  /** Acquire or return the existing owner's reference (data-model.md). */
  acquireOrReturnExisting(
    scopeKey: string,
    operationKind: OperationKind,
    taskId: string,
    changeSetId: string | null,
    ttlMs: number,
  ): Promise<{ acquired: boolean; ownerTaskId: string | null }>;
  heartbeat(scopeKey: string, taskId: string): Promise<boolean>;
  /** Release the lease only when it is still owned by this task. */
  release(scopeKey: string, taskId: string): Promise<boolean>;
  /** Reclaim only after confirming the referenced task is not active. */
  reclaimIfExpired(scopeKey: string, now: Date): Promise<boolean>;
}

export interface IRecoveryPointRepository {
  findById(id: string): Promise<RecoveryPoint | null>;
  findByChangeSet(changeSetId: string): Promise<RecoveryPoint | null>;
  create(data: Omit<RecoveryPoint, "id" | "createdAt">): Promise<RecoveryPoint>;
  updateStatus(id: string, status: string): Promise<RecoveryPoint | null>;
  /** Reference-safe expiry; never deletes a recovery point still referenced by audit/task. */
  expireIfUnreferenced(id: string, now: Date): Promise<boolean>;
  /** Persist per-object recovery items (ordered: parents before children). */
  createItems(
    items: ReadonlyArray<{
      recoveryPointId: string;
      entityType: string;
      entityId: string;
      entityVersion: number;
      payload: Record<string, unknown>;
      itemOrder: number;
      checksum: string;
    }>,
  ): Promise<void>;
  /** Load recovery items for a restore preview/apply. */
  findItems(recoveryPointId: string): Promise<
    ReadonlyArray<{
      entityType: string;
      entityId: string | null;
      entityVersion: number | null;
      payload: unknown;
      itemOrder: number;
      checksum: string;
    }>
  >;
}
