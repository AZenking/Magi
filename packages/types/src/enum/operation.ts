/**
 * Operation-related enums (T006).
 *
 * Source of truth for operation kind/status, change action, and actor type.
 * Consumed by API, Worker and Web as the wire vocabulary for the unified
 * high-risk operation protocol (research §1, contracts/operation-previews.md).
 */

/** Every high-risk operation supported by the preview/apply protocol. */
export const OPERATION_KIND = [
  "m3u_sync",
  "epg_match",
  "source_delete",
  "channel_lifecycle_batch",
  "channel_purge",
  "backup_restore",
  "recovery_restore",
] as const;
export type OperationKind = (typeof OPERATION_KIND)[number];

/** Change-set lifecycle states (data-model.md OperationChangeSet). */
export const CHANGE_SET_STATUS = [
  "preparing",
  "ready",
  "applying",
  "applied",
  "failed",
  "stale",
  "cancelled",
  "expired",
] as const;
export type ChangeSetStatus = (typeof CHANGE_SET_STATUS)[number];

/** Per-item action within a change set (data-model.md OperationChangeItem). */
export const CHANGE_ACTION = [
  "add",
  "update",
  "mark_missing",
  "lifecycle",
  "bind",
  "unbind",
  "delete",
  "restore",
  "preserve",
  "conflict",
] as const;
export type ChangeAction = (typeof CHANGE_ACTION)[number];

/** Who or what initiated an operation/audit event. */
export const ACTOR_TYPE = ["user", "schedule", "system"] as const;
export type ActorType = (typeof ACTOR_TYPE)[number];

/** Scope type for mutual exclusion (data-model.md OperationLease.scopeKey). */
export const OPERATION_SCOPE_TYPE = ["source", "channel", "global"] as const;
export type OperationScopeType = (typeof OPERATION_SCOPE_TYPE)[number];

/** Result of an apply attempt (data-model.md AuditEvent.result). */
export const OPERATION_RESULT = [
  "accepted",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type OperationResult = (typeof OPERATION_RESULT)[number];

/** Classification bucket for EPG match candidates (contracts/operation-previews.md). */
export const EPG_MATCH_CLASSIFICATION = [
  "exact",
  "fuzzy",
  "conflict",
  "unmatched",
] as const;
export type EpgMatchClassification = (typeof EPG_MATCH_CLASSIFICATION)[number];

/** Origin of a decision binding (data-model.md CanonicalChannelMember.membershipSource). */
export const DECISION_SOURCE = ["automatic", "manual", "migrated"] as const;
export type DecisionSource = (typeof DECISION_SOURCE)[number];

/**
 * Task wire status (contracts/tasks.md). v6 wire vocabulary.
 *
 * During migration the existing DB value `success` is mapped to `succeeded` at
 * the contract boundary. The legacy `TaskStatus` enum in this package keeps
 * `success` for backward compatibility with already-persisted rows; new code
 * must use `TASK_WIRE_STATUS`.
 */
export const TASK_WIRE_STATUS = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type TaskWireStatus = (typeof TASK_WIRE_STATUS)[number];
