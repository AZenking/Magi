/**
 * Schedule wire DTOs (T008).
 *
 * Persistent scheduled-job resource + save/trigger requests.
 * Mirror contracts/schedules.md. Overlap policy is `skip`-only in this release
 * but the enum stays forward-compatible.
 */
import { z } from "zod";
import { OVERLAP_POLICY } from "../enum/failover";
import { OperationScopeSchema } from "./operation";

/** Schedule representation: exactly one of interval/cron. */
export const ScheduleSpecSchema = z
  .object({
    type: z.enum(["interval", "cron"]),
    intervalMs: z.number().int().positive().optional(),
    cronExpression: z.string().optional(),
  })
  .refine(
    (s) => (s.type === "interval" && s.intervalMs) || (s.type === "cron" && s.cronExpression),
    { message: "interval requires intervalMs; cron requires cronExpression" },
  );
export type ScheduleSpec = z.infer<typeof ScheduleSpecSchema>;

export const ScheduledJobVoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  taskType: z.string().min(1),
  scope: OperationScopeSchema,
  enabled: z.boolean(),
  schedule: ScheduleSpecSchema,
  timeZone: z.string().min(1),
  overlapPolicy: z.enum(OVERLAP_POLICY),
  nextRunAt: z.string().datetime().nullable(),
  lastRunAt: z.string().datetime().nullable(),
  lastStatus: z.string().nullable(),
  lastSkipReason: z.string().nullable(),
  version: z.number().int().nonnegative(),
});
export type ScheduledJobVo = z.infer<typeof ScheduledJobVoSchema>;

export const SaveScheduleRequestSchema = z.object({
  enabled: z.boolean(),
  schedule: ScheduleSpecSchema,
  timeZone: z.string().min(1),
  overlapPolicy: z.enum(OVERLAP_POLICY),
});
export type SaveScheduleRequest = z.infer<typeof SaveScheduleRequestSchema>;
