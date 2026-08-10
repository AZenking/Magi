/**
 * Worker operation-execution port (T027).
 *
 * Abstraction over the operation/change-set/snapshot/recovery persistence that
 * the Worker needs to execute Safe Operations apply/restore/cleanup. The Worker
 * application depends on this interface; the Drizzle implementation lives in
 * `infrastructure/` (constitution III).
 *
 * Mirrors a subset of the API's operation-safety repository surface — only the
 * methods the Worker needs to read snapshots, claim leases, and write results.
 */
export interface IOperationExecutionRepository {
  /** Load a change set's input fingerprint + base versions for re-validation. */
  loadChangeSetForApply(changeSetId: string): Promise<{
    id: string;
    inputFingerprint: string;
    status: string;
    expiresAt: Date;
  } | null>;

  /** Load the immutable snapshot items for diff/apply. */
  loadSnapshotItems(snapshotId: string): Promise<
    ReadonlyArray<{
      channelIdentity: string;
      collisionOrdinal: number;
      itemOrder: number;
      payload: unknown;
    }>
  >;

  /** Atomically transition a change set to a terminal status (with version check). */
  finalizeChangeSet(
    changeSetId: string,
    status: string,
    version: number,
  ): Promise<boolean>;

  /** Acquire or confirm the scope lease (returns false if another task owns it). */
  acquireLease(
    scopeKey: string,
    taskId: string,
    ttlMs: number,
  ): Promise<{ acquired: boolean; ownerTaskId: string | null }>;

  /** Renew the lease heartbeat. */
  heartbeatLease(scopeKey: string, taskId: string): Promise<void>;

  /** Release the lease only when it is still owned by this task. */
  releaseLease(scopeKey: string, taskId: string): Promise<void>;
}
