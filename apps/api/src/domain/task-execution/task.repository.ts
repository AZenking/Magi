import type { Task, TaskStatus, TaskType } from "./task.model";

export interface ITaskRepository {
  findAll(params: {
    page: number;
    pageSize: number;
    status?: TaskStatus;
    sourceType?: string;
    taskType?: string;
    queueName?: string;
  }): Promise<{ items: Task[]; total: number }>;
  findById(id: string): Promise<Task | null>;
  findActiveBySource(taskType: TaskType, sourceId: string): Promise<Task | null>;
  create(data: Omit<Task, "id" | "createdAt">): Promise<Task>;
  update(id: string, data: Partial<Pick<Task, "status" | "finishedAt" | "error" | "progress" | "currentStep" | "executionLog" | "importedCount" | "addedCount" | "updatedCount" | "removedCount" | "queueName" | "jobId" | "jobName" | "attemptsMade" | "processedOn">>): Promise<Task | null>;
  // --- Safe Operations (T022): scope/target/retry/summary queries. ---
  findByScope(scopeType: string, scopeId: string): Promise<Task[]>;
  findActiveByScope(scopeType: string, scopeId: string): Promise<Task | null>;
  findByRoot(rootTaskId: string): Promise<Task[]>;
  /** Compact running/failed/recently-completed set for the global Header. */
  findSummary(): Promise<{ runningCount: number; failedCount: number; items: Task[] }>;
  /** Safe-ops-aware update including stage, relations, result, cancellation. */
  updateSafeOps(id: string, data: Partial<Task>): Promise<Task | null>;
}

export * from "./task.model";
