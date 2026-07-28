/**
 * Failover policy enums (T007).
 *
 * Channel-level failover modes (research §11, data-model.md ChannelFailoverPolicy).
 * `manual_only` is the safe default during migration.
 */
export const FAILOVER_MODE = [
  "manual_only",
  "auto_keep_fallback",
  "auto_restore_primary",
] as const;
export type FailoverMode = (typeof FAILOVER_MODE)[number];

/** Overlap policy for scheduled jobs (contracts/schedules.md). */
export const OVERLAP_POLICY = ["skip"] as const;
export type OverlapPolicy = (typeof OVERLAP_POLICY)[number];

/** Recovery-point lifecycle (data-model.md RecoveryPoint.status). */
export const RECOVERY_POINT_STATUS = [
  "creating",
  "ready",
  "restoring",
  "restored",
  "invalid",
  "expired",
] as const;
export type RecoveryPointStatus = (typeof RECOVERY_POINT_STATUS)[number];

/** Snapshot status (data-model.md SourceImportSnapshot.status). */
export const SNAPSHOT_STATUS = ["preparing", "ready", "invalid", "expired"] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUS)[number];
