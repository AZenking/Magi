/**
 * Audit wire DTOs (T008).
 *
 * AuditEvent list/detail. Append-only; detail never returns credentials.
 * Mirror contracts/common.md (`GET /audit-events`).
 *
 * NOTE (analyze H2): `result` uses OPERATION_RESULT (accepted|succeeded|...),
 * which is distinct from TASK_WIRE_STATUS — they are independent enums.
 */
import { z } from "zod";
import { ACTOR_TYPE, OPERATION_RESULT } from "../enum/operation";

export const AuditEventVoSchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actorType: z.enum(ACTOR_TYPE),
  actorId: z.string(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string(),
  displayName: z.string().nullable(),
  result: z.enum(OPERATION_RESULT),
  requestId: z.string().nullable(),
  taskId: z.string().uuid().nullable(),
  parentTaskId: z.string().uuid().nullable(),
  changeSetId: z.string().uuid().nullable(),
  recoveryPointId: z.string().uuid().nullable(),
  summary: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
});
export type AuditEventVo = z.infer<typeof AuditEventVoSchema>;

export const AuditEventListQuerySchema = z.object({
  action: z.string().optional(),
  result: z.enum(OPERATION_RESULT).optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  taskId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type AuditEventListQuery = z.infer<typeof AuditEventListQuerySchema>;
