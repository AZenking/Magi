/**
 * Worker bootstrap (T027).
 *
 * Wires the Clean Architecture layers and starts BullMQ workers. Each worker:
 *   1. validates the incoming job payload shape (processor responsibility);
 *   2. hands a typed `Job` to the application `JobRunner`, which dispatches to
 *      the registered handler and reports lifecycle milestones via ports.
 *
 * Concrete handlers are registered by the caller (legacy processors today;
 * Safe Operations use cases in US1+). Drizzle/BullMQ live only in this file
 * and the adapter classes — `application/` and `domain/` never import them
 * (constitution III).
 */
import { Worker, type Job } from "bullmq";
import { createLogger } from "@magi/utils";
import { redis } from "../../redis";
import type { JobKind, JobPayload } from "@/domain/job-execution";
import { JobRunner } from "@/application/job-runner";
import { registerOperationHandlers } from "./operation-worker";
import { startOperationCleanupWorker } from "./operation-cleanup-worker";
import { DrizzleJobExecutionRepository } from "../database/drizzle-job-execution.repository";

const logger = createLogger({ context: "worker-bootstrap" });

export interface WorkerQueueConfig {
  queue: string;
  concurrency: number;
  /** Job kinds this queue handles. */
  kinds: readonly JobKind[];
}

export interface BootstrapOptions {
  queues: readonly WorkerQueueConfig[];
  /** Register handlers before workers start. */
  registerHandlers: (runner: JobRunner) => void;
}

/**
 * Build the application runner with infrastructure ports injected. Exported so
 * tests can construct a runner without starting BullMQ.
 */
export function buildJobRunner(): JobRunner {
  const taskRepo = new DrizzleJobExecutionRepository();
  return new JobRunner({ taskRepo });
}

/**
 * Start BullMQ workers that validate payload + hand off to the JobRunner.
 * Returns a shutdown function.
 */
export async function startWorkers(options: BootstrapOptions): Promise<() => Promise<void>> {
  const runner = buildJobRunner();
  options.registerHandlers(runner);

  // Register Safe Operations handlers + start the cleanup worker (T041).
  // NOTE: registerOperationHandlers is called AFTER the caller's registerHandlers
  // in main.ts. If the caller already registered operation-* handlers, we skip
  // the stubs. The stubs are only for the case where the caller doesn't register them.
  const registeredKinds = (runner as unknown as { handlers: Map<string, unknown> }).handlers;
  if (!registeredKinds?.has("operation-prepare")) {
    registerOperationHandlers(runner);
  }
  const stopCleanup = startOperationCleanupWorker();

  const workers: Worker[] = [];
  for (const cfg of options.queues) {
    const worker = new Worker(
      cfg.queue,
      async (bullJob: Job) => {
        const payload = bullJob.data as JobPayload;
        if (!payload || !payload.taskId) {
          throw new Error(`Invalid job payload on ${cfg.queue}/${bullJob.name}: missing taskId`);
        }
        const job: import("@/domain/job-execution").Job = {
          id: bullJob.id ?? "",
          name: bullJob.name as JobKind,
          payload,
        };
        logger.info("Processing job", {
          queue: cfg.queue,
          name: job.name,
          taskId: payload.taskId,
          requestId: payload.requestId ?? null,
        });
        return runner.run(job);
      },
      { connection: redis as never, concurrency: cfg.concurrency },
    );
    worker.on("completed", (j) => logger.info("Job completed", { jobId: j.id }));
    worker.on("failed", (j, err) =>
      logger.error("Job failed", { jobId: j?.id, error: err.message }),
    );
    workers.push(worker);
  }

  logger.info("Worker started", {
    queues: options.queues.map((q) => `${q.queue}(${q.kinds.join(",")})`).join(", "),
  });

  return async () => {
    logger.info("Shutting down workers...");
    stopCleanup();
    await Promise.all(workers.map((w) => w.close()));
  };
}
