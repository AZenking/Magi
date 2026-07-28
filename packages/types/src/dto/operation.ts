/**
 * Operation preview/apply wire DTOs (T006).
 *
 * Schemas for the unified high-risk operation protocol:
 *   POST /operations/previews
 *   GET  /operations/change-sets/{id}
 *   GET  /operations/change-sets/{id}/items
 *   PATCH /operations/change-sets/{id}/items
 *   POST /operations/change-sets/{id}/apply
 *   POST /operations/change-sets/{id}/cancel
 *
 * Shapes mirror contracts/operation-previews.md. Discriminated union by `kind`
 * keeps per-operation input strict. All schemas are strict Zod; TS types are
 * inferred via `z.infer` (constitution V — no parallel handwritten types).
 */
import { z } from "zod";
import {
  ACTOR_TYPE,
  CHANGE_ACTION,
  CHANGE_SET_STATUS,
  DECISION_SOURCE,
  EPG_MATCH_CLASSIFICATION,
  OPERATION_KIND,
  OPERATION_RESULT,
  OPERATION_SCOPE_TYPE,
} from "../enum/operation";

// ---------------------------------------------------------------------------
// Scope & target
// ---------------------------------------------------------------------------
export const OperationScopeSchema = z.object({
  type: z.enum(OPERATION_SCOPE_TYPE),
  id: z.string().uuid(),
});
export type OperationScope = z.infer<typeof OperationScopeSchema>;

export const OperationTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().uuid(),
  displayName: z.string().min(1),
});
export type OperationTarget = z.infer<typeof OperationTargetSchema>;

// ---------------------------------------------------------------------------
// Change-set summary (added/updated/missing/deleted/preserved/conflicts/unmatched)
// ---------------------------------------------------------------------------
export const ChangeSetSummarySchema = z.object({
  added: z.number().int().nonnegative().default(0),
  updated: z.number().int().nonnegative().default(0),
  missing: z.number().int().nonnegative().default(0),
  deleted: z.number().int().nonnegative().default(0),
  preserved: z.number().int().nonnegative().default(0),
  conflicts: z.number().int().nonnegative().default(0),
  unmatched: z.number().int().nonnegative().default(0),
});
export type ChangeSetSummary = z.infer<typeof ChangeSetSummarySchema>;

export const ChangeWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});
export type ChangeWarning = z.infer<typeof ChangeWarningSchema>;

export const ChangeBlockerSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});
export type ChangeBlocker = z.infer<typeof ChangeBlockerSchema>;

// ---------------------------------------------------------------------------
// Change-set resource
// ---------------------------------------------------------------------------
export const OperationChangeSetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(OPERATION_KIND),
  status: z.enum(CHANGE_SET_STATUS),
  expiresAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
  operationFingerprint: z.string().optional(),
  summary: ChangeSetSummarySchema.optional(),
  warnings: z.array(ChangeWarningSchema).optional(),
  blockers: z.array(ChangeBlockerSchema).optional(),
});
export type OperationChangeSetVo = z.infer<typeof OperationChangeSetSchema>;

// ---------------------------------------------------------------------------
// Change item
// ---------------------------------------------------------------------------
export const OperationChangeItemSchema = z.object({
  itemId: z.string().uuid(),
  classification: z.string().optional(),
  action: z.enum(CHANGE_ACTION).optional(),
  selected: z.boolean(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  reasonCode: z.string().optional(),
  lockManualDecision: z.boolean().optional(),
  candidateId: z.string().optional(),
});
export type OperationChangeItemVo = z.infer<typeof OperationChangeItemSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export const OperationDecisionSchema = z.object({
  itemId: z.string().uuid(),
  selected: z.boolean(),
  candidateId: z.string().optional(),
  lockManualDecision: z.boolean().optional(),
});
export type OperationDecision = z.infer<typeof OperationDecisionSchema>;

export const UpdateChangeDecisionsRequestSchema = z.object({
  decisions: z.array(OperationDecisionSchema).min(1),
});
export type UpdateChangeDecisionsRequest = z.infer<typeof UpdateChangeDecisionsRequestSchema>;

export const ApplyOperationRequestSchema = z.object({
  confirmedWarningCodes: z.array(z.string()).default([]),
  operatorReason: z.string().max(500).optional(),
});
export type ApplyOperationRequest = z.infer<typeof ApplyOperationRequestSchema>;

// ---------------------------------------------------------------------------
// EPG classification helper (US3 workbench)
// ---------------------------------------------------------------------------
export const EpgMatchClassificationSchema = z.enum(EPG_MATCH_CLASSIFICATION);

/**
 * Canonical decision record persisted on a change item. `source` tracks why a
 * binding exists so US3 can show "automatic vs manual vs migrated".
 */
export const DecisionRecordSchema = z.object({
  candidateId: z.string(),
  locked: z.boolean().default(false),
  reason: z.string().max(500).optional(),
  source: z.enum(DECISION_SOURCE),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

// Re-export actor + result enums for convenience in HTTP serialization.
export { ACTOR_TYPE, OPERATION_RESULT };
