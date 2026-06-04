export type TaskType = "m3u-sync" | "xmltv-sync" | "source-check" | "stream-check";
export type TaskStatus = "pending" | "running" | "success" | "failed";

export interface Task {
  id: string;
  sourceType: string;
  taskType: TaskType;
  sourceId: string;
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
  createdAt: Date;
}

export class TaskModel {
  constructor(private readonly task: Task) {}

  isRunning(): boolean {
    return this.task.status === "running";
  }

  isFinished(): boolean {
    return this.task.status === "success" || this.task.status === "failed";
  }

  durationMs(): number | null {
    if (!this.task.finishedAt) return null;
    return this.task.finishedAt.getTime() - this.task.startedAt.getTime();
  }

  toObject(): Task {
    return { ...this.task };
  }
}
