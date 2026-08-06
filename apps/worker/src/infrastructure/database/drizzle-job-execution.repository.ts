/**
 * Drizzle job-execution repository adapter (T027).
 *
 * Implements `IJobExecutionRepository` against the shared `sync_logs` table.
 * This is the infrastructure layer — it imports Drizzle, which the Worker
 * application layer never imports (constitution III).
 */
import { eq } from "drizzle-orm";
import type { IJobExecutionRepository } from "@/domain/job-execution";
import type { JobResult } from "@/domain/job-execution";
import { db } from "../../db";
import { syncLogs } from "../../schema";

export class DrizzleJobExecutionRepository implements IJobExecutionRepository {
  async create(input: {
    sourceType: string;
    taskType: string;
    sourceId: string | null;
    jobName: string;
    queueName: string;
  }): Promise<{ id: string }> {
    const now = new Date();
    const [row] = await db.insert(syncLogs).values({
      sourceType: input.sourceType,
      taskType: input.taskType,
      sourceId: input.sourceId,
      status: "running",
      startedAt: now,
      finishedAt: null,
      error: null,
      progress: 0,
      currentStep: "starting",
      executionLog: null,
      importedCount: 0,
      addedCount: 0,
      updatedCount: 0,
      removedCount: 0,
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: null,
      attemptsMade: 0,
      processedOn: now,
    }).returning({ id: syncLogs.id });
    if (!row) throw new Error("Failed to create sync_logs row");
    return { id: row.id };
  }

  async markRunning(taskId: string, step: string): Promise<void> {
    await db
      .update(syncLogs)
      .set({ status: "running", currentStep: step, processedOn: new Date() })
      .where(eq(syncLogs.id, taskId));
  }

  async updateProgress(taskId: string, percent: number, step: string): Promise<void> {
    await db
      .update(syncLogs)
      .set({ progress: percent, currentStep: step })
      .where(eq(syncLogs.id, taskId));
  }

  async markSucceeded(taskId: string, result: JobResult): Promise<void> {
    await db
      .update(syncLogs)
      .set({
        status: "success",
        finishedAt: new Date(),
        currentStep: "done",
        progress: 100,
        importedCount: result.importedCount ?? 0,
        addedCount: result.addedCount ?? 0,
        updatedCount: result.updatedCount ?? 0,
        removedCount: result.removedCount ?? 0,
      })
      .where(eq(syncLogs.id, taskId));
  }

  async markFailed(taskId: string, error: string, attemptsMade?: number): Promise<void> {
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error,
        ...(attemptsMade !== undefined && { attemptsMade }),
      })
      .where(eq(syncLogs.id, taskId));
  }

  async markRetrying(taskId: string, error: string, attemptsMade: number): Promise<void> {
    await db
      .update(syncLogs)
      .set({ currentStep: "retrying", error, attemptsMade })
      .where(eq(syncLogs.id, taskId));
  }

  async updateSafeOps(taskId: string, data: Record<string, unknown>): Promise<void> {
    await db.update(syncLogs).set(data).where(eq(syncLogs.id, taskId));
  }
}
