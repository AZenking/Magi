import type { Task, TaskStatus } from "./task.model";

export interface ITaskRepository {
  findAll(params: {
    page: number;
    pageSize: number;
    status?: TaskStatus;
    sourceType?: string;
    taskType?: string;
  }): Promise<{ items: Task[]; total: number }>;
  findById(id: string): Promise<Task | null>;
  create(data: Omit<Task, "id" | "createdAt">): Promise<Task>;
  update(id: string, data: Partial<Pick<Task, "status" | "finishedAt" | "error" | "progress" | "currentStep" | "executionLog" | "importedCount" | "addedCount" | "updatedCount" | "removedCount">>): Promise<Task | null>;
}

export * from "./task.model";
