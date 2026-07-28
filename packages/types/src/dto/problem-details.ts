/**
 * RFC 9457 Problem Details (T009).
 *
 * Error envelope for `application/problem+json`. Stable `code` is the contract
 * the Web branches on — never parse `detail`. Mirror contracts/common.md.
 */
import { z } from "zod";

export const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Stable machine code — the front-end branches on this, not on `detail`. */
  code: z.string().min(1),
  requestId: z.string().optional(),
  retryable: z.boolean().optional(),
  /** Extension members for specific error codes. */
  currentVersion: z.number().int().optional(),
  changedFields: z.array(z.string()).optional(),
  previewId: z.string().uuid().optional(),
  conflicts: z.array(z.unknown()).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

/** Canonical stable error codes (contracts/common.md). */
export const ERROR_CODE = {
  INVALID_COMMAND: "invalid-command",
  AUTHENTICATION_REQUIRED: "authentication-required",
  RESOURCE_NOT_FOUND: "resource-not-found",
  OPERATION_IN_PROGRESS: "operation-in-progress",
  PREVIEW_STALE: "preview-stale",
  IDEMPOTENCY_KEY_REUSED: "idempotency-key-reused",
  INVALID_STATE_TRANSITION: "invalid-state-transition",
  PREVIEW_EXPIRED: "preview-expired",
  RESOURCE_PURGED: "resource-purged",
  STALE_RESOURCE: "stale-resource",
  VALIDATION_FAILED: "validation-failed",
  PRECONDITION_REQUIRED: "precondition-required",
  OPERATION_CAPACITY_UNAVAILABLE: "operation-capacity-unavailable",
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
