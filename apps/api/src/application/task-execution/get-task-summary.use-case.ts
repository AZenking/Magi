/**
 * GetTaskSummaryUseCase (T082).
 *
 * Compact running/failed/recently-completed task set for the global Header
 * (contracts/tasks.md GET /tasks/summary). Polls only while work is active.
 */
import type { ITaskRepository } from "@/domain/task-execution";
import type { Task } from "@/domain/task-execution";

export interface TaskSummaryResult {
  readonly runningCount: number;
  readonly failedCount: number;
  readonly items: ReadonlyArray<{
    id: string;
    type: string;
    status: string;
    targetDisplayName: string;
  }>;
}

export class GetTaskSummaryUseCase {
  constructor(private readonly taskRepo: ITaskRepository) {}

  async execute(): Promise<TaskSummaryResult> {
    const { runningCount, failedCount, items } = await this.taskRepo.findSummary();
    return {
      runningCount,
      failedCount,
      items: items.map((t: Task) => ({
        id: t.id,
        type: t.taskType,
        status: t.status,
        targetDisplayName: t.targetDisplayName ?? t.sourceId ?? t.taskType,
      })),
    };
  }
}
