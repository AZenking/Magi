/**
 * Task query keys + reads + mutations (T086).
 *
 * Mirrors contracts/tasks.md:
 * - GET /tasks/summary → compact running/failed/recent for the header badge.
 * - GET /tasks/{id}    → full task detail (TaskDetailVo wire shape).
 * - POST /tasks/{id}/retry | /cancel → Idempotency-Key required.
 *
 * Polling rules (contracts/tasks.md "Polling obligations"):
 * - Detail: 2s while pending/running; stop on terminal state.
 * - Summary: 5s while any task is active; stop when idle.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import type {
  TaskDetailVo,
  TaskSummaryVo,
  TaskWireStatus,
} from "@magi/types";

/** API envelope (contracts/common.md): every response wraps payload in `data`. */
interface Envelope<T> {
  success: boolean;
  data: T;
}

// --- Query keys ---
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (params: Record<string, unknown>) =>
    [...taskKeys.lists(), params] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (taskId: string) => [...taskKeys.details(), taskId] as const,
  summary: () => [...taskKeys.all, "summary"] as const,
};

/** Terminal states — no further polling after these (contracts/tasks.md). */
const TERMINAL_STATUS: ReadonlySet<TaskWireStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  // Legacy wire value still emitted during migration.
  "success" as TaskWireStatus,
]);

export function isTerminalStatus(status: string | undefined | null): boolean {
  return !!status && TERMINAL_STATUS.has(status as TaskWireStatus);
}

// --- Reads ---

/**
 * Compact summary for the global header badge. Polls every 5s while any task
 * is active (runningCount > 0 or failedCount > 0 surfaces recently failed);
 * stops when fully idle (contracts/tasks.md "Polling obligations").
 */
export function useTaskSummary() {
  return useQuery({
    queryKey: taskKeys.summary(),
    queryFn: async () => {
      const res = await apiClient<Envelope<TaskSummaryVo>>("/tasks/summary");
      return res.data;
    },
    refetchInterval: (query) => {
      const summary = query.state.data;
      if (!summary) return 5_000;
      // Active = something in flight OR unresolved failures a user might act on.
      const hasActive =
        summary.runningCount > 0 ||
        summary.failedCount > 0 ||
        summary.items.some((i) => !isTerminalStatus(i.status));
      return hasActive ? 5_000 : false;
    },
  });
}

/**
 * Full task detail. Polls every 2s while pending/running; stops on terminal
 * state (contracts/tasks.md "Polling obligations").
 */
export function useTaskDetail(taskId: string | null | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ""),
    queryFn: async () => {
      const res = await apiClient<Envelope<TaskDetailVo>>(`/tasks/${taskId}`);
      return res.data;
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isTerminalStatus(status) ? false : 2_000;
    },
  });
}

// --- Mutations ---

interface RetryResult {
  retried: boolean;
  newTaskId?: string;
}

/**
 * Retry a failed/cancelled task. Idempotency-Key makes the same key return the
 * same retry task (contracts/tasks.md "Retry"). Caller supplies the key so it
 * is stable across refetch cycles.
 */
export function useRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; idempotencyKey: string }) => {
      const res = await apiClient<Envelope<RetryResult>>(
        `/tasks/${input.taskId}/retry`,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.idempotencyKey },
        },
      );
      return res.data;
    },
    onSuccess: (_data, input) => {
      // Terminal result invalidates only related target collections and the
      // summary; the old task detail is now stale because a retry was created.
      qc.invalidateQueries({ queryKey: taskKeys.detail(input.taskId) });
      qc.invalidateQueries({ queryKey: taskKeys.summary() });
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

/**
 * Cancel a pending/running task. Idempotency-Key required
 * (contracts/tasks.md "Cancellation").
 */
export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; idempotencyKey: string }) => {
      const res = await apiClient<Envelope<{ cancelled: boolean }>>(
        `/tasks/${input.taskId}/cancel`,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.idempotencyKey },
        },
      );
      return res.data;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(input.taskId) });
      qc.invalidateQueries({ queryKey: taskKeys.summary() });
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
