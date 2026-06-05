import { describe, it, expect } from "vitest";
import type { ITaskRepository, Task } from "@/domain/task-execution";
import { FindTasksUseCase } from "../find-tasks.use-case";
import { FindTaskUseCase } from "../find-task.use-case";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    sourceType: "m3u",
    taskType: "m3u-sync",
    sourceId: "src-1",
    status: "success",
    startedAt: new Date("2025-01-01T10:00:00Z"),
    finishedAt: new Date("2025-01-01T10:05:00Z"),
    error: null,
    progress: 100,
    currentStep: null,
    executionLog: null,
    importedCount: 50,
    addedCount: 30,
    updatedCount: 10,
    removedCount: 5,
    queueName: "source-sync",
    jobId: "task-1",
    jobName: "m3u-sync",
    attemptsMade: 0,
    processedOn: null,
    createdAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

const mockQueueAdapter = {
  enqueue: async () => ({ jobId: "j1", taskId: "t1" }),
  cancel: async () => true,
  retry: async () => true,
  getJobState: async () => null,
  getJobDetail: async () => null,
};

describe("FindTasksUseCase", () => {
  it("returns paginated tasks", async () => {
    const tasks = [createTask(), createTask({ id: "task-2" })];
    const useCase = new FindTasksUseCase({
      findAll: async () => ({ items: tasks, total: 2 }),
    } as unknown as ITaskRepository);

    const result = await useCase.execute({ page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("returns empty when no tasks", async () => {
    const useCase = new FindTasksUseCase({
      findAll: async () => ({ items: [], total: 0 }),
    } as unknown as ITaskRepository);

    const result = await useCase.execute({ page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(0);
  });

  it("passes status filter", async () => {
    const repo = {
      findAll: async (params: Record<string, unknown>) => {
        expect(params.status).toBe("failed");
        return { items: [], total: 0 };
      },
    } as unknown as ITaskRepository;

    const useCase = new FindTasksUseCase(repo);
    await useCase.execute({ page: 1, pageSize: 20, status: "failed" });
  });
});

describe("FindTaskUseCase", () => {
  it("returns task by id", async () => {
    const task = createTask();
    const useCase = new FindTaskUseCase(
      { findById: async () => task } as unknown as ITaskRepository,
      mockQueueAdapter as never,
    );

    const result = await useCase.execute("task-1");
    expect(result.id).toBe("task-1");
  });

  it("throws NotFoundException when task not found", async () => {
    const useCase = new FindTaskUseCase(
      { findById: async () => null } as unknown as ITaskRepository,
      mockQueueAdapter as never,
    );

    await expect(useCase.execute("missing")).rejects.toThrow("Task not found");
  });
});
