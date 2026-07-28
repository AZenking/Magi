/**
 * Dashboard read models (T008).
 *
 * Operations summary + source effective policy for the home page.
 * Mirror contracts/common.md.
 */
import { z } from "zod";

export const IssueCardSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  actionUrl: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
});
export type IssueCard = z.infer<typeof IssueCardSchema>;

export const OperationsSummaryVoSchema = z.object({
  latestM3uSyncAt: z.string().datetime().nullable(),
  latestXmltvSyncAt: z.string().datetime().nullable(),
  latestStreamCheckAt: z.string().datetime().nullable(),
  epgCoverage: z.number().min(0).max(1),
  tvgIdCoverage: z.number().min(0).max(1),
  streamAvailability: z.number().min(0).max(1),
  runningTaskCount: z.number().int().nonnegative(),
  failedTaskCount: z.number().int().nonnegative(),
  staleSources: z.number().int().nonnegative(),
  issues: z.array(IssueCardSchema),
});
export type OperationsSummaryVo = z.infer<typeof OperationsSummaryVoSchema>;

export const SourceReadinessSchema = z.object({
  canSync: z.boolean(),
  canMatch: z.boolean(),
  blockerCodes: z.array(z.string()),
});
export type SourceReadiness = z.infer<typeof SourceReadinessSchema>;

export const SourceEffectivePolicySchema = z.object({
  enabled: z.boolean(),
  participatesInOutput: z.boolean(),
  role: z.string(),
  priority: z.number().int(),
  fallbackAllowed: z.boolean(),
  summary: z.string(),
});
export type SourceEffectivePolicy = z.infer<typeof SourceEffectivePolicySchema>;
