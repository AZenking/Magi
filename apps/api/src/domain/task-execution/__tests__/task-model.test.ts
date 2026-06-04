import { describe, it, expect } from "vitest";
import { TaskModel } from "../task.model";
import type { Task } from "../task.model";

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
    createdAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

describe("TaskModel", () => {
  describe("isRunning", () => {
    it("returns true for running status", () => {
      expect(new TaskModel(createTask({ status: "running" })).isRunning()).toBe(true);
    });

    it("returns false for success status", () => {
      expect(new TaskModel(createTask({ status: "success" })).isRunning()).toBe(false);
    });

    it("returns false for failed status", () => {
      expect(new TaskModel(createTask({ status: "failed" })).isRunning()).toBe(false);
    });

    it("returns false for pending status", () => {
      expect(new TaskModel(createTask({ status: "pending" })).isRunning()).toBe(false);
    });
  });

  describe("isFinished", () => {
    it("returns true for success", () => {
      expect(new TaskModel(createTask({ status: "success" })).isFinished()).toBe(true);
    });

    it("returns true for failed", () => {
      expect(new TaskModel(createTask({ status: "failed" })).isFinished()).toBe(true);
    });

    it("returns false for running", () => {
      expect(new TaskModel(createTask({ status: "running" })).isFinished()).toBe(false);
    });

    it("returns false for pending", () => {
      expect(new TaskModel(createTask({ status: "pending" })).isFinished()).toBe(false);
    });
  });

  describe("durationMs", () => {
    it("calculates duration when finished", () => {
      const task = createTask({
        startedAt: new Date("2025-01-01T10:00:00Z"),
        finishedAt: new Date("2025-01-01T10:05:00Z"),
      });
      expect(new TaskModel(task).durationMs()).toBe(5 * 60 * 1000);
    });

    it("returns null when not finished", () => {
      const task = createTask({ finishedAt: null });
      expect(new TaskModel(task).durationMs()).toBeNull();
    });
  });

  describe("toObject", () => {
    it("returns a copy of the task", () => {
      const task = createTask();
      const obj = new TaskModel(task).toObject();
      expect(obj).toEqual(task);
      expect(obj).not.toBe(task);
    });
  });
});
