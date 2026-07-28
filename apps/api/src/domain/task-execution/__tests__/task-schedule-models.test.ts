/**
 * Task + Schedule domain model tests (T075).
 *
 * Validates task status/capability/retry-root/cancel-checkpoint semantics
 * and schedule draft invariants (FR-022/FR-024/FR-025, contracts/tasks.md).
 */
import { describe, it, expect } from "vitest";
import { TaskModel, type Task } from "../task.model";
import { ScheduledJobModel, type ScheduledJob } from "../scheduled-job.model";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    sourceType: "m3u",
    taskType: "m3u-sync",
    sourceId: "s1",
    status: "running",
    startedAt: new Date(),
    finishedAt: null,
    error: null,
    progress: 50,
    currentStep: "working",
    executionLog: null,
    importedCount: 0,
    addedCount: 0,
    updatedCount: 0,
    removedCount: 0,
    queueName: "source-sync",
    jobId: "j1",
    jobName: null,
    attemptsMade: 1,
    processedOn: null,
    createdAt: new Date(),
    ...overrides,
  } as Task;
}

describe("TaskModel capabilities (T075)", () => {
  it("maps legacy 'success' to wire 'succeeded'", () => {
    expect(new TaskModel(task({ status: "success" })).wireStatus()).toBe("succeeded");
  });

  it("canCancel is false once finished", () => {
    expect(new TaskModel(task({ status: "failed" })).canCancel()).toBe(false);
    expect(new TaskModel(task({ status: "cancelled" })).canCancel()).toBe(false);
  });

  it("canCancel is false in the applying commit stage", () => {
    expect(new TaskModel(task({ status: "running", stage: "applying" })).canCancel()).toBe(false);
    expect(new TaskModel(task({ status: "running", stage: "verifying" })).canCancel()).toBe(false);
  });

  it("canCancel is true for a pending/running task not in commit stage", () => {
    expect(new TaskModel(task({ status: "pending", stage: "pending" })).canCancel()).toBe(true);
    expect(new TaskModel(task({ status: "running", stage: "preparing" })).canCancel()).toBe(true);
  });

  it("canRetry is true only for failed/cancelled", () => {
    expect(new TaskModel(task({ status: "failed" })).canRetry()).toBe(true);
    expect(new TaskModel(task({ status: "cancelled" })).canRetry()).toBe(true);
    expect(new TaskModel(task({ status: "running" })).canRetry()).toBe(false);
  });
});

function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: "sched-1",
    name: "Test",
    description: null,
    taskType: "m3u-sync",
    scopeType: "source",
    scopeId: "s1",
    enabled: true,
    intervalMs: 3600000,
    cronExpression: null,
    timeZone: "Asia/Shanghai",
    overlapPolicy: "skip",
    nextRunAt: new Date(Date.now() + 3600000),
    lastRunAt: null,
    lastStatus: null,
    lastSkipReason: null,
    version: 1,
    ...overrides,
  };
}

describe("ScheduledJobModel invariants (T075)", () => {
  it("producesRuns is true only when enabled + nextRunAt set", () => {
    expect(new ScheduledJobModel(job()).producesRuns()).toBe(true);
    expect(new ScheduledJobModel(job({ enabled: false })).producesRuns()).toBe(false);
    expect(new ScheduledJobModel(job({ nextRunAt: null })).producesRuns()).toBe(false);
  });

  it("hasValidSchedule requires exactly one of interval/cron", () => {
    expect(new ScheduledJobModel(job({ intervalMs: 60000 })).hasValidSchedule()).toBe(true);
    expect(new ScheduledJobModel(job({ intervalMs: null, cronExpression: "0 * * * *" })).hasValidSchedule()).toBe(true);
    expect(new ScheduledJobModel(job({ intervalMs: null, cronExpression: null })).hasValidSchedule()).toBe(false);
    expect(new ScheduledJobModel(job({ intervalMs: 0 })).hasValidSchedule()).toBe(false);
  });
});
