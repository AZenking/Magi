/**
 * Operation cleanup worker scheduler (T041).
 *
 * Periodically invokes CleanupOperationStateUseCase to expire terminal change
 * sets, snapshots, idempotency records and reclaim expired leases. Runs on a
 * fixed interval (default 1h) via a BullMQ repeatable job or setInterval.
 */
import { createLogger } from "@magi/utils";
import { CleanupOperationStateUseCase } from "@/application/operation-safety/cleanup-operation-state.use-case";
import { DrizzleOperationExecutionRepository } from "../database/operation-execution.repository";

const logger = createLogger({ context: "operation-cleanup" });

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Start the cleanup loop. Returns a stop function.
 * Uses setInterval (not BullMQ repeatable) so cleanup runs even when queues
 * are idle — cleanup is housekeeping, not a queued operation.
 */
export function startOperationCleanupWorker(): () => void {
  const repo = new DrizzleOperationExecutionRepository();
  const useCase = new CleanupOperationStateUseCase(repo);

  const timer = setInterval(async () => {
    try {
      const result = await useCase.execute();
      logger.info("Operation-state cleanup completed", result);
    } catch (err) {
      logger.error("Operation-state cleanup failed", { error: (err as Error).message });
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info("Operation cleanup worker started", { intervalMs: CLEANUP_INTERVAL_MS });

  return () => {
    clearInterval(timer);
    logger.info("Operation cleanup worker stopped");
  };
}
