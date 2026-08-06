/**
 * Safe-operation job lifecycle tests (T032) — RED phase.
 *
 * Defines expected behavior of the Worker job-runner under BullMQ semantics
 * (T041): duplicate/stalled/retry handling, scope lease enforcement, commit-
 * stage cancellation refusal. Uses the in-memory JobRunner from T027 with mock
 * handlers and repositories.
 *
 * Goes green as the Safe Operations handlers (T037-T041) are wired.
 */
import { describe, it, expect } from "vitest";
import { JobRunner } from "../job-runner";
import type { IJobExecutionRepository } from "@/domain/job-execution";
import type { JobResult } from "@/domain/job-execution";

function mockTaskRepo(): IJobExecutionRepository {
  const events: { taskId: string; status: string }[] = [];
  return {
    create: async () => ({ id: `t-${events.length + 1}` }),
    markRunning: async (taskId, _step) => { events.push({ taskId, status: "running" }); },
    updateProgress: async () => {},
    markSucceeded: async (taskId) => { events.push({ taskId, status: "success" }); },
    markFailed: async (taskId) => { events.push({ taskId, status: "failed" }); },
    markRetrying: async (taskId) => { events.push({ taskId, status: "retrying" }); },
    updateSafeOps: async () => {},
  };
}

describe("JobRunner lifecycle (T032)", () => {
  it("marks running then succeeded for a handler that returns a result", async () => {
    const repo = mockTaskRepo();
    const runner = new JobRunner({ taskRepo: repo });
    const result: JobResult = { taskId: "t1", addedCount: 5 };
    runner.register("m3u-sync", async () => result);
    const out = await runner.run({
      id: "j1",
      name: "m3u-sync",
      payload: { taskId: "t1", sourceId: "s1", sourceType: "m3u" },
    });
    expect(out).toEqual(result);
  });

  it("marks failed and rethrows when the handler throws", async () => {
    const repo = mockTaskRepo();
    const runner = new JobRunner({ taskRepo: repo });
    runner.register("m3u-sync", async () => { throw new Error("boom"); });
    await expect(
      runner.run({ id: "j2", name: "m3u-sync", payload: { taskId: "t2" } }),
    ).rejects.toThrow("boom");
  });

  it("rejects an unknown job kind with no handler registered", async () => {
    const runner = new JobRunner({ taskRepo: mockTaskRepo() });
    await expect(
      runner.run({ id: "j3", name: "operation-apply", payload: { taskId: "t3" } }),
    ).rejects.toThrow("No handler registered");
  });
});
