/**
 * Worker job-execution repository port (T027).
 *
 * Abstraction over task-state persistence. The Worker application uses this to
 * report lifecycle milestones back to the shared task table without importing
 * Drizzle (constitution III).
 */
import type { JobResult } from "./job.model";

export interface IJobExecutionRepository {
  create(input: {
    sourceType: string;
    taskType: string;
    sourceId: string | null;
    jobName: string;
    queueName: string;
  }): Promise<{ id: string }>;
  markRunning(taskId: string, step: string): Promise<void>;
  updateProgress(taskId: string, percent: number, step: string): Promise<void>;
  markSucceeded(taskId: string, result: JobResult): Promise<void>;
  markFailed(taskId: string, error: string, attemptsMade?: number): Promise<void>;
  markRetrying(taskId: string, error: string, attemptsMade: number): Promise<void>;
  /** Safe-ops-aware update (scope/stage/result/relations). */
  updateSafeOps(taskId: string, data: Record<string, unknown>): Promise<void>;
}
