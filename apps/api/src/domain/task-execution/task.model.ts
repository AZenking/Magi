export type TaskType = "m3u-sync" | "xmltv-sync" | "epg-match" | "source-check" | "stream-check" | "import-epg" | "refresh-epg" | "cleanup";
export type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

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

  toObject(): Task {
    return { ...this.task };
  }
}
