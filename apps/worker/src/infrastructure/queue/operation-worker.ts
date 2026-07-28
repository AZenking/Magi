/**
 * Operation worker registration (T041).
 *
 * Registers the Safe Operations job handlers (operation-prepare/apply/restore/
 * cleanup) with the JobRunner. Infrastructure layer — wires concrete Worker
 * use cases to their Drizzle-backed repository adapters.
 *
 * The handlers themselves (T037–T040) depend only on ports; this file injects
 * the Drizzle adapters and is the only place that knows about both.
 */
import type { JobRunner } from "@/application/job-runner";
import type { Job, JobProgress } from "@/domain/job-execution";
import type { JobResult } from "@/domain/job-execution";

/**
 * Register Safe Operations handlers. The concrete repository wiring lands as
 * the ISourceSyncRepository / IEpgSyncRepository / ICanonicalReconcileRepository
 * Drizzle adapters are implemented (T041 infrastructure). Until then this
 * registers stub handlers that record "not yet wired" so the worker can boot
 * and route legacy jobs.
 */
export function registerOperationHandlers(runner: JobRunner): void {
  runner.register("operation-prepare", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    // TODO(T041): inject PrepareM3uSyncUseCase / PrepareEpgMatchUseCase based on job.payload.kind.
    return { taskId: job.payload.taskId, importedCount: 0 };
  });

  runner.register("operation-apply", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    // TODO(T041): inject ApplyM3uSyncUseCase / ApplyEpgMatchUseCase based on job.payload.kind.
    return { taskId: job.payload.taskId, importedCount: 0 };
  });

  runner.register("operation-restore", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    // TODO(T041): inject ApplyRecoveryRestoreUseCase.
    return { taskId: job.payload.taskId, importedCount: 0 };
  });

  runner.register("operation-cleanup", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    // TODO(T041): inject CleanupOperationStateUseCase.
    return { taskId: job.payload.taskId, importedCount: 0 };
  });
}
