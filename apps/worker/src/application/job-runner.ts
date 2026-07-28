/**
 * Worker application job-runner (T027).
 *
 * Framework-agnostic dispatch from a job to its handler. Depends ONLY on domain
 * ports and `@magi/backend-core` pure algorithms (constitution III). The
 * concrete Drizzle/BullMQ implementations are injected from `infrastructure/`.
 *
 * Legacy processors (m3u-sync, epg-match, ...) are wrapped through a
 * `LegacyHandler` adapter so their existing business logic is preserved while
 * the boundary is established. Safe Operations handlers (operation-prepare/apply/
 * restore/cleanup) are registered here as their use cases land in US1.
 */
import type { IJobExecutionRepository } from "../domain/job-execution";
import type { IOperationExecutionRepository } from "../domain/operation-safety";
import type { Job, JobKind, JobProgress, JobResult } from "../domain/job-execution";

export type JobHandler = (job: Job, progress: JobProgress) => Promise<JobResult>;

export interface JobRunnerDeps {
  readonly taskRepo: IJobExecutionRepository;
  readonly operationRepo?: IOperationExecutionRepository;
}

export class JobRunner {
  private readonly handlers = new Map<JobKind, JobHandler>();

  constructor(private readonly deps: JobRunnerDeps) {}

  /** Register a handler for a job kind (infrastructure wires concrete handlers). */
  register(kind: JobKind, handler: JobHandler): this {
    this.handlers.set(kind, handler);
    return this;
  }

  /**
   * Execute one job: mark running, dispatch, then mark succeeded/failed.
   * Structured trace context (taskId/requestId) is added by the caller.
   */
  async run(job: Job): Promise<JobResult> {
    const { taskId } = job.payload;
    const progress: JobProgress = {
      update: async (percent, step) => {
        await this.deps.taskRepo.updateProgress(taskId, percent, step);
      },
    };
    await this.deps.taskRepo.markRunning(taskId, "starting");
    const handler = this.handlers.get(job.name);
    if (!handler) {
      const err = `No handler registered for job kind: ${job.name}`;
      await this.deps.taskRepo.markFailed(taskId, err);
      throw new Error(err);
    }
    try {
      const result = await handler(job, progress);
      await this.deps.taskRepo.markSucceeded(taskId, result);
      return result;
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 500) ?? "Unknown error";
      await this.deps.taskRepo.markFailed(taskId, msg);
      throw e;
    }
  }
}
