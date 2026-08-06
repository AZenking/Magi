/**
 * Playback report request schema (008-pipeline-reliability T003).
 *
 * Used by POST /api/open/v1/playback/report to let TV clients report the
 * outcome of a playback attempt (failure or success) for a specific stream.
 */
import { z } from "zod";

export const PlaybackReportRequestSchema = z
  .object({
    channel_id: z.string().min(1),
    stream_id: z.string().uuid(),
    outcome: z.enum(["failure", "success"]),
    error_kind: z
      .enum(["network", "http", "decoder", "source", "timeout"])
      .nullable()
      .default(null),
    played_duration_ms: z.number().int().min(0).default(0),
    reported_at: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.outcome === "success" && data.error_kind !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error_kind must be null when outcome is success",
        path: ["error_kind"],
      });
    }
    if (data.outcome === "failure" && data.error_kind === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error_kind is required when outcome is failure",
        path: ["error_kind"],
      });
    }
  });

export type PlaybackReportRequest = z.infer<typeof PlaybackReportRequestSchema>;
