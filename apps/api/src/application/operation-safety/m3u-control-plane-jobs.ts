/**
 * Source-scoped M3U job payloads + idempotency helpers (T010, 009).
 *
 * Defines explicit, validated shapes for the three source-scoped job phases
 * (prepare → apply → confirm/cancel). Combined with the lease port, these
 * enforce research §7:
 *
 *   - One source-scoped change set is in flight at a time per source.
 *   - Same input fingerprint → reused snapshot (no re-apply).
 *   - Stale source version → rejected before apply.
 *
 * The lease is acquired on the API side at enqueue time (see
 * `leaseScopeFor`) and released on success/failure by the Worker via
 * `IOperationLeasePort`. Idempotency keys are deterministic so retries do
 * not duplicate rows.
 */
import type { TaskType } from "@/domain/task-execution";

/** Job kinds introduced by 009 (registered alongside legacy kinds in worker-bootstrap). */
export type M3uControlPlaneJobKind =
  | "m3u-prepare"
  | "m3u-apply"
  | "m3u-confirm";

/** Prepare: download + parse + diff. Idempotent on (sourceId, fingerprint). */
export interface M3uPrepareJobPayload {
  readonly taskType: "m3u-prepare";
  readonly taskId: string;
  readonly sourceId: string;
  readonly sourceType: "m3u";
  readonly sourceVersion: number;
  readonly requestedBy: string;
  readonly requestId: string;
  readonly parentTaskId?: string;
  readonly rootTaskId?: string;
  readonly idempotencyKey: string;
  readonly leaseScope: string;
}

/** Apply: write the change set atomically. Conditional on `expectedStatus`. */
export interface M3uApplyJobPayload {
  readonly taskType: "m3u-apply";
  readonly taskId: string;
  readonly sourceId: string;
  readonly sourceType: "m3u";
  readonly changeSetId: string;
  readonly snapshotId: string;
  readonly sourceVersion: number;
  readonly confirmedWarningCodes: readonly string[];
  readonly operatorReason?: string;
  readonly requestedBy: string;
  readonly requestId: string;
  readonly parentTaskId?: string;
  readonly rootTaskId?: string;
  readonly idempotencyKey: string;
  readonly leaseScope: string;
}

/** Confirm/cancel: operator-approved transition of an anomalous change set. */
export interface M3uConfirmJobPayload {
  readonly taskType: "m3u-confirm";
  readonly taskId: string;
  readonly sourceId: string;
  readonly sourceType: "m3u";
  readonly changeSetId: string;
  readonly decision: "apply" | "cancel";
  readonly operatorReason?: string;
  readonly requestedBy: string;
  readonly requestId: string;
  readonly parentTaskId?: string;
  readonly rootTaskId?: string;
  readonly idempotencyKey: string;
  readonly leaseScope: string;
}

export type M3uControlPlaneJobPayload =
  | M3uPrepareJobPayload
  | M3uApplyJobPayload
  | M3uConfirmJobPayload;

/** Set of job kinds the Worker must register handlers for (009). */
export const M3U_CONTROL_PLANE_JOB_KINDS: readonly M3uControlPlaneJobKind[] = [
  "m3u-prepare",
  "m3u-apply",
  "m3u-confirm",
];

/** Map a 009 job kind back to the legacy TaskType used by sync_logs. */
export function taskTypeForJobKind(kind: M3uControlPlaneJobKind): TaskType {
  // All three phases run under the m3u-sync task family so dashboards keep a
  // single source-scoped view per source.
  void kind;
  return "m3u-sync";
}

/**
 * Build the source-scoped lease key. One lease per source ensures the
 * prepare/apply phases for the same source never run concurrently, even when
 * manual and scheduled triggers race.
 */
export function leaseScopeFor(sourceId: string): string {
  return `m3u-control-plane:source:${sourceId}`;
}

/**
 * Build a deterministic idempotency key for prepare. Re-enqueuing with the
 * same (source, version, fingerprint) returns the existing snapshot.
 */
export function prepareIdempotencyKey(input: {
  sourceId: string;
  sourceVersion: number;
  contentFingerprint: string;
}): string {
  return `prepare:${input.sourceId}:v${input.sourceVersion}:${input.contentFingerprint}`;
}

/**
 * Build a deterministic idempotency key for apply. Same change set + same
 * confirmed warnings → no-op.
 */
export function applyIdempotencyKey(input: {
  changeSetId: string;
  sourceVersion: number;
  confirmedWarningCodes: readonly string[];
}): string {
  const sorted = [...input.confirmedWarningCodes].sort().join(",");
  return `apply:${input.changeSetId}:v${input.sourceVersion}:${sorted || "-"}`;
}

/** Build a deterministic idempotency key for confirm. */
export function confirmIdempotencyKey(input: {
  changeSetId: string;
  decision: "apply" | "cancel";
}): string {
  return `confirm:${input.changeSetId}:${input.decision}`;
}

/**
 * Build a deterministic BullMQ jobId for deduplication. When two callers
 * enqueue the same payload, BullMQ returns the existing job.
 */
export function deduplicationIdFor(
  kind: M3uControlPlaneJobKind,
  idempotencyKey: string,
): string {
  return `${kind}:${idempotencyKey}`;
}

/** Default lease TTL — long enough for a 10k-channel sync, short enough to recover from a crashed worker. */
export const DEFAULT_LEASE_TTL_SECONDS = 600;

/**
 * Heartbeat cadence. The Worker calls `heartbeat` at this interval while a
 * long apply is running. Must be < DEFAULT_LEASE_TTL_SECONDS / 2 to avoid
 * premature expiry under load.
 */
export const LEASE_HEARTBEAT_INTERVAL_SECONDS = 30;

/** Structured log context shared by every 009 job. */
export interface M3uControlPlaneLogContext {
  readonly taskType: M3uControlPlaneJobKind;
  readonly taskId: string;
  readonly sourceId: string;
  readonly changeSetId?: string;
  readonly snapshotId?: string;
  readonly requestId: string;
  readonly leaseScope: string;
  readonly idempotencyKey: string;
}

/** Build a structured-log context object from a job payload (constitution VII). */
export function logContextFromPayload(
  payload: M3uControlPlaneJobPayload,
): M3uControlPlaneLogContext {
  return {
    taskType: payload.taskType,
    taskId: payload.taskId,
    sourceId: payload.sourceId,
    changeSetId:
      payload.taskType === "m3u-apply" || payload.taskType === "m3u-confirm"
        ? payload.changeSetId
        : undefined,
    snapshotId: payload.taskType === "m3u-apply" ? payload.snapshotId : undefined,
    requestId: payload.requestId,
    leaseScope: payload.leaseScope,
    idempotencyKey: payload.idempotencyKey,
  };
}
