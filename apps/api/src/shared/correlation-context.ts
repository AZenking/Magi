/**
 * Correlation context helper (009-m3u-control-plane T057).
 *
 * Bundles the request/task/change-set identifiers into a single structured-
 * log context object so operational dashboards can trace a sync from
 * preview → apply → publication across API + Worker boundaries.
 *
 * Each helper reads its slice from the AsyncLocalStorage-backed
 * `currentRequestId` (for requestId) and from explicit arguments for the
 * domain-specific identifiers (changeSetId, taskId, grantId). The output is
 * a flat object safe to spread into a pino child logger or audit event.
 */
import { currentRequestId } from "@/shared/http/request-context.middleware";

export interface M3uControlPlaneLogContext {
  readonly requestId: string | null;
  readonly changeSetId?: string | null;
  readonly taskId?: string | null;
  readonly sourceId?: string | null;
  readonly grantId?: string | null;
  readonly recoveryPointId?: string | null;
  readonly scope: string;
}

/**
 * Build a structured-log context for an M3U control-plane lifecycle event.
 * The scope identifies which dashboard lane the event belongs to:
 *   "prepare" | "apply" | "recovery" | "purge" | "grant" | "failover"
 */
export function buildCorrelationContext(input: {
  readonly scope:
    | "prepare"
    | "apply"
    | "recovery"
    | "purge"
    | "grant"
    | "failover";
  readonly changeSetId?: string | null;
  readonly taskId?: string | null;
  readonly sourceId?: string | null;
  readonly grantId?: string | null;
  readonly recoveryPointId?: string | null;
}): M3uControlPlaneLogContext {
  return {
    requestId: currentRequestId() ?? null,
    scope: input.scope,
    changeSetId: input.changeSetId ?? null,
    taskId: input.taskId ?? null,
    sourceId: input.sourceId ?? null,
    grantId: input.grantId ?? null,
    recoveryPointId: input.recoveryPointId ?? null,
  };
}

/**
 * Redacted summary for an audit event — drops any secret-bearing fields
 * before persistence. Used by the grant + playlist audit writers.
 */
export function redactedAuditSummary(input: {
  readonly action: string;
  readonly targetId: string;
  readonly targetType: string;
  readonly result: "accepted" | "succeeded" | "failed" | "cancelled";
  readonly reason?: string | null;
}): Record<string, unknown> {
  return {
    action: input.action,
    targetId: input.targetId,
    targetType: input.targetType,
    result: input.result,
    reason: input.reason ?? null,
  };
}
