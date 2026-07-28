/**
 * Task & recovery wire DTOs (T008).
 *
 * TaskRef + Task detail + summary + capabilities + relations + result.
 * Mirror contracts/tasks.md. Uses TASK_WIRE_STATUS (`succeeded`, not legacy
 * `success`).
 */
import { z } from "zod";
import { ACTOR_TYPE, TASK_WIRE_STATUS } from "../enum/operation";
import { OperationScopeSchema, OperationTargetSchema } from "./operation";

// ---------------------------------------------------------------------------
// TaskRef — returned from every 202 Accepted background command
// ---------------------------------------------------------------------------
export const TaskRefSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  status: z.enum(TASK_WIRE_STATUS),
  statusUrl: z.string().min(1),
  scope: OperationScopeSchema,
  target: OperationTargetSchema,
  submittedAt: z.string().datetime(),
});
export type TaskRefVo = z.infer<typeof TaskRefSchema>;

// ---------------------------------------------------------------------------
// Task progress & capabilities
// ---------------------------------------------------------------------------
export const TaskProgressSchema = z.object({
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
  message: z.string().optional(),
});
export type TaskProgress = z.infer<typeof TaskProgressSchema>;

export const TaskCapabilitiesSchema = z.object({
  canCancel: z.boolean(),
  canRetry: z.boolean(),
  canRestore: z.boolean(),
});
export type TaskCapabilities = z.infer<typeof TaskCapabilitiesSchema>;

export const TaskRelationsSchema = z.object({
  parentTaskId: z.string().uuid().nullable(),
  rootTaskId: z.string().uuid().nullable(),
  changeSetId: z.string().uuid().nullable(),
  recoveryPointId: z.string().uuid().nullable(),
});
export type TaskRelations = z.infer<typeof TaskRelationsSchema>;

export const TaskResultSchema = z.object({
  summary: z.string().optional(),
  counts: z.record(z.string(), z.number()).optional(),
  links: z
    .object({
      changeSetId: z.string().uuid().optional(),
      recoveryPointId: z.string().uuid().optional(),
    })
    .optional(),
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

// ---------------------------------------------------------------------------
// Task detail (GET /tasks/{id})
// ---------------------------------------------------------------------------
export const TaskDetailVoSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  status: z.enum(TASK_WIRE_STATUS),
  stage: z.string().optional(),
  scope: OperationScopeSchema,
  target: OperationTargetSchema,
  initiator: z.object({ type: z.enum(ACTOR_TYPE), id: z.string() }),
  progress: TaskProgressSchema.nullable(),
  capabilities: TaskCapabilitiesSchema,
  relations: TaskRelationsSchema,
  result: TaskResultSchema.nullable(),
  error: z.string().nullable(),
  submittedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type TaskDetailVo = z.infer<typeof TaskDetailVoSchema>;

// ---------------------------------------------------------------------------
// Task list query & summary (GET /tasks, GET /tasks/summary)
// ---------------------------------------------------------------------------
export const TaskListQuerySchema = z.object({
  scopeType: z.string().optional(),
  scopeId: z.string().uuid().optional(),
  targetType: z.string().optional(),
  targetId: z.string().uuid().optional(),
  rootTaskId: z.string().uuid().optional(),
  status: z.enum(TASK_WIRE_STATUS).optional(),
  type: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const TaskSummaryItemVoSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  status: z.enum(TASK_WIRE_STATUS),
  targetDisplayName: z.string().min(1),
});
export type TaskSummaryItemVo = z.infer<typeof TaskSummaryItemVoSchema>;

export const TaskSummaryVoSchema = z.object({
  runningCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  items: z.array(TaskSummaryItemVoSchema),
});
export type TaskSummaryVo = z.infer<typeof TaskSummaryVoSchema>;

// ---------------------------------------------------------------------------
// Recovery point (GET /recovery-points, GET /recovery-points/{id})
// ---------------------------------------------------------------------------
import { RECOVERY_POINT_STATUS } from "../enum/failover";

export const RecoveryPointVoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(RECOVERY_POINT_STATUS),
  operationKind: z.string(),
  scopeType: z.string(),
  scopeId: z.string().uuid(),
  changeSetId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  itemCount: z.number().int().nonnegative(),
  checksum: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  canRestore: z.boolean(),
});
export type RecoveryPointVo = z.infer<typeof RecoveryPointVoSchema>;
