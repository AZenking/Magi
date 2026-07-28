export type TaskType = "m3u-sync" | "xmltv-sync" | "epg-match" | "source-check" | "stream-check" | "import-epg" | "refresh-epg" | "cleanup";
export type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";
/** Commit stage — cancellation is refused once `applying` (contracts/tasks.md). */
export type TaskStage = "pending" | "preparing" | "ready" | "applying" | "verifying" | "done";

export interface Task {
  id: string;
  sourceType: string;
  taskType: TaskType;
  sourceId: string | null;
  status: TaskStatus;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  progress: number;
  currentStep: string | null;
  executionLog: string | null;
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  queueName: string | null;
  jobId: string | null;
  jobName: string | null;
  attemptsMade: number;
  processedOn: Date | null;
  createdAt: Date;
  // --- Safe Operations expand fields (T022). Optional during transition. ---
  scopeType?: string;
  scopeId?: string;
  targetType?: string;
  targetId?: string;
  targetDisplayName?: string;
  initiatorType?: "user" | "schedule" | "system";
  initiatorId?: string;
  parentTaskId?: string | null;
  rootTaskId?: string | null;
  changeSetId?: string | null;
  recoveryPointId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  inputFingerprint?: string | null;
  stage?: TaskStage;
  resultSummary?: Record<string, unknown> | null;
  cancelledAt?: Date | null;
  cancelRequestedAt?: Date | null;
}

export class TaskModel {
  constructor(private readonly task: Task) {}

  isRunning(): boolean {
    return this.task.status === "running";
  }

  isFinished(): boolean {
    return this.task.status === "success" || this.task.status === "failed" || this.task.status === "cancelled";
  }

  durationMs(): number | null {
    if (!this.task.finishedAt) return null;
    return this.task.finishedAt.getTime() - this.task.startedAt.getTime();
  }

  /** Map legacy DB `success` → wire `succeeded` (contracts/tasks.md). */
  wireStatus(): "pending" | "running" | "succeeded" | "failed" | "cancelled" {
    return this.task.status === "success" ? "succeeded" : this.task.status;
  }

  /** Cancellation capability depends on the commit stage (FR-025, contracts/tasks.md). */
  canCancel(): boolean {
    if (this.isFinished()) return false;
    // In the atomic applying/verifying commit stage the task is not safely cancellable.
    return this.task.stage !== "applying" && this.task.stage !== "verifying";
  }

  canRetry(): boolean {
    return this.task.status === "failed" || this.task.status === "cancelled";
  }

  toObject(): Task {
    return { ...this.task };
  }
}
