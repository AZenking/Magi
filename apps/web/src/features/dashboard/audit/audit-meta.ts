/**
 * Audit display metadata (T107).
 *
 * Centralized labels and Tag colors for actor types and operation results.
 * Token-driven semantic colors (T001): success/warning/error/default map to
 * antd Tag color tokens so the theme controls the actual rendering.
 */
import type { ActorType, OperationResult } from "@magi/types";

export const AUDIT_ACTOR_LABELS: Record<ActorType, string> = {
  user: "用户",
  schedule: "调度",
  system: "系统",
};

export const AUDIT_RESULT_META: Record<
  OperationResult,
  { label: string; color: string }
> = {
  accepted: { label: "已受理", color: "processing" },
  succeeded: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  skipped: { label: "跳过", color: "default" },
  cancelled: { label: "取消", color: "warning" },
};
