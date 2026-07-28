/**
 * CleanupOperationStateUseCase (T041).
 *
 * Reference-safe expiry of terminal change sets, source snapshots and
 * idempotency records after 24h — ONLY when no active task, recovery point or
 * audit event still references them. Expired leases reclaimed only after the
 * referenced task is confirmed non-active. Audit events are never cleaned up
 * (data-model.md retention invariants).
 *
 * Depends only on domain ports (constitution III).
 */
export interface ICleanupPort {
  /** Delete terminal change sets older than cutoff, only if unreferenced. */
  expireTerminalChangeSets(cutoff: Date): Promise<number>;
  /** Delete source snapshots older than cutoff, only if unreferenced. */
  expireSnapshots(cutoff: Date): Promise<number>;
  /** Delete idempotency records past their 24h expiry (never shorter). */
  expireIdempotencyRecords(now: Date): Promise<number>;
  /** Reclaim leases past TTL whose referenced task is not active. */
  reclaimExpiredLeases(now: Date): Promise<number>;
}

export interface CleanupOperationStateInput {
  readonly now?: Date;
}

export interface CleanupOperationStateResult {
  readonly expiredChangeSets: number;
  readonly expiredSnapshots: number;
  readonly expiredIdempotencyRecords: number;
  readonly reclaimedLeases: number;
}

/** 24-hour retention for change sets, snapshots, idempotency records. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

export class CleanupOperationStateUseCase {
  constructor(private readonly port: ICleanupPort) {}

  async execute(input: CleanupOperationStateInput = {}): Promise<CleanupOperationStateResult> {
    const now = input.now ?? new Date();
    const cutoff = new Date(now.getTime() - RETENTION_MS);

    const [expiredChangeSets, expiredSnapshots, expiredIdempotencyRecords, reclaimedLeases] =
      await Promise.all([
        this.port.expireTerminalChangeSets(cutoff),
        this.port.expireSnapshots(cutoff),
        this.port.expireIdempotencyRecords(now),
        this.port.reclaimExpiredLeases(now),
      ]);

    return { expiredChangeSets, expiredSnapshots, expiredIdempotencyRecords, reclaimedLeases };
  }
}
