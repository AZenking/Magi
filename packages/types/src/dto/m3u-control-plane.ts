/**
 * M3U control-plane wire DTOs (T004, feature 009-m3u-control-plane).
 *
 * Adds five bounded contexts on top of the existing operation/change-set
 * vocabulary:
 *   - M3U change summaries (with explicit confirmation requirement)
 *   - Merge candidate review (weak-signal composition)
 *   - Output grant lifecycle (per-player revocable access)
 *   - Output publication projection (fresh/stale/blocked)
 *   - Stream health observation + failover event evidence
 *
 * Schemas are strict Zod; TS types use `z.infer`. No parallel handwritten
 * wire types (constitution V). Mirror `contracts/m3u-control-plane.md`.
 */
import { z } from "zod";
import { CHANGE_SET_STATUS } from "../enum/operation";

// ---------------------------------------------------------------------------
// M3U change set summary
// ---------------------------------------------------------------------------
export const M3uChangeSetSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
});
export type M3uChangeSetSummary = z.infer<typeof M3uChangeSetSummarySchema>;

export const M3uChangeWarningSchema = z.object({
  code: z.enum([
    "empty-snapshot",
    "deletion-ratio-exceeded",
    "duplicate-identity",
    "source-version-mismatch",
  ]),
  message: z.string().min(1),
  deletionRatio: z.number().min(0).max(1).optional(),
});
export type M3uChangeWarning = z.infer<typeof M3uChangeWarningSchema>;

export const M3uChangeSetVoSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("m3u_sync"),
  status: z.enum(CHANGE_SET_STATUS),
  sourceId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  inputFingerprint: z.string().min(1),
  sourceVersion: z.number().int().nonnegative(),
  summary: M3uChangeSetSummarySchema,
  requiresConfirmation: z.boolean(),
  warnings: z.array(M3uChangeWarningSchema).default([]),
  snapshotExpiresAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
});
export type M3uChangeSetVo = z.infer<typeof M3uChangeSetVoSchema>;

// ---------------------------------------------------------------------------
// Merge candidate review
// ---------------------------------------------------------------------------
export const MERGE_CANDIDATE_METHOD = [
  "normalized_name",
  "normalized_name_group",
] as const;
export type MergeCandidateMethod = (typeof MERGE_CANDIDATE_METHOD)[number];

export const MERGE_CANDIDATE_STATUS = [
  "pending",
  "accepted",
  "rejected",
  "stale",
] as const;
export type MergeCandidateStatus = (typeof MERGE_CANDIDATE_STATUS)[number];

export const MergeCandidateVoSchema = z.object({
  id: z.string().uuid(),
  sourceChannelId: z.string().uuid(),
  canonicalChannelId: z.string().uuid().nullable(),
  method: z.enum(MERGE_CANDIDATE_METHOD),
  reasons: z.array(z.string()),
  status: z.enum(MERGE_CANDIDATE_STATUS),
  sourceFingerprint: z.string().min(1),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().nullable(),
});
export type MergeCandidateVo = z.infer<typeof MergeCandidateVoSchema>;

export const ReviewMergeCandidateRequestSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  canonicalChannelId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});
export type ReviewMergeCandidateRequest = z.infer<
  typeof ReviewMergeCandidateRequestSchema
>;

// ---------------------------------------------------------------------------
// Output grant lifecycle (per-player revocable access)
// ---------------------------------------------------------------------------
export const OUTPUT_GRANT_PROFILE = ["primary", "all"] as const;
export type OutputGrantProfile = (typeof OUTPUT_GRANT_PROFILE)[number];

export const OUTPUT_GRANT_STATUS = ["active", "revoked", "expired"] as const;
export type OutputGrantStatus = (typeof OUTPUT_GRANT_STATUS)[number];

export const CreateOutputGrantRequestSchema = z.object({
  displayName: z.string().min(1).max(120),
  deviceClientId: z.string().uuid().nullable().default(null),
  profile: z.enum(OUTPUT_GRANT_PROFILE).default("primary"),
  expiresAt: z.string().datetime().nullable().default(null),
});
export type CreateOutputGrantRequest = z.infer<typeof CreateOutputGrantRequestSchema>;

export const RotateOutputGrantRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RotateOutputGrantRequest = z.infer<typeof RotateOutputGrantRequestSchema>;

export const RevokeOutputGrantRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RevokeOutputGrantRequest = z.infer<typeof RevokeOutputGrantRequestSchema>;

export const OutputGrantSummaryVoSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  deviceClientId: z.string().uuid().nullable(),
  profile: z.enum(OUTPUT_GRANT_PROFILE),
  status: z.enum(OUTPUT_GRANT_STATUS),
  tokenPrefix: z.string().min(1),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type OutputGrantSummaryVo = z.infer<typeof OutputGrantSummaryVoSchema>;

export const OutputGrantIssuedVoSchema = z.object({
  grant: OutputGrantSummaryVoSchema,
  /** Plaintext URL returned exactly once on create/rotate. */
  playlistUrl: z.string().url(),
});
export type OutputGrantIssuedVo = z.infer<typeof OutputGrantIssuedVoSchema>;

// ---------------------------------------------------------------------------
// Output publication projection
// ---------------------------------------------------------------------------
export const OUTPUT_PUBLICATION_STATUS = ["fresh", "stale", "blocked"] as const;
export type OutputPublicationStatus = (typeof OUTPUT_PUBLICATION_STATUS)[number];

export const OutputPublicationVoSchema = z.object({
  revision: z.string().min(1),
  status: z.enum(OUTPUT_PUBLICATION_STATUS),
  publishedAt: z.string().datetime().nullable(),
  channelCount: z.number().int().nonnegative(),
  playableChannelCount: z.number().int().nonnegative(),
  excludedChannelCount: z.number().int().nonnegative(),
  blockingReason: z.string().nullable(),
});
export type OutputPublicationVo = z.infer<typeof OutputPublicationVoSchema>;

// ---------------------------------------------------------------------------
// Stream health observation + failover event
// ---------------------------------------------------------------------------
export const HEALTH_OBSERVATION_SOURCE = ["active_probe", "playback_report"] as const;
export type HealthObservationSource = (typeof HEALTH_OBSERVATION_SOURCE)[number];

export const HEALTH_OBSERVATION_RESULT = ["success", "failure"] as const;
export type HealthObservationResult = (typeof HEALTH_OBSERVATION_RESULT)[number];

export const StreamHealthObservationVoSchema = z.object({
  id: z.string().uuid(),
  streamId: z.string().uuid(),
  canonicalChannelId: z.string().uuid(),
  source: z.enum(HEALTH_OBSERVATION_SOURCE),
  result: z.enum(HEALTH_OBSERVATION_RESULT),
  errorClass: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  observedAt: z.string().datetime(),
  taskId: z.string().uuid().nullable(),
  deviceClientId: z.string().uuid().nullable(),
});
export type StreamHealthObservationVo = z.infer<
  typeof StreamHealthObservationVoSchema
>;

export const FAILOVER_TRIGGER = [
  "auto_failure_threshold",
  "auto_recovery",
  "manual",
] as const;
export type FailoverTrigger = (typeof FAILOVER_TRIGGER)[number];

export const FailoverEventVoSchema = z.object({
  id: z.string().uuid(),
  canonicalChannelId: z.string().uuid(),
  previousStreamId: z.string().uuid().nullable(),
  nextStreamId: z.string().uuid(),
  trigger: z.enum(FAILOVER_TRIGGER),
  reason: z.string().min(1),
  observedAt: z.string().datetime(),
});
export type FailoverEventVo = z.infer<typeof FailoverEventVoSchema>;
