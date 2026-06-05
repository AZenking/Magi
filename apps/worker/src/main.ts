import { Worker, QueueEvents, Queue } from "bullmq";
import { createLogger } from "@magi/utils";
import { redis } from "./redis";
import { db } from "./db";
import { syncLogs } from "./schema";
import { eq } from "drizzle-orm";
import { processM3uSync } from "./processors/m3u-sync.processor";
import { processXmltvSync } from "./processors/xmltv-sync.processor";
import { processEpgMatch } from "./processors/epg-match.processor";

const logger = createLogger({ context: "worker" });

async function updateTask(taskId: string, data: Record<string, unknown>) {
  await db.update(syncLogs).set(data).where(eq(syncLogs.id, taskId));
}

interface SyncProgress {
  updateProgress(pct: number, step: string): Promise<void>;
}

type SourceSyncJob = {
  taskId: string;
  sourceId: string;
  sourceType: string;
};

type EpgJob = {
  taskId: string;
  sourceId: string;
  sourceType?: string;
};

function createProgress(jobId: string | undefined, taskId: string) {
  return {
    async updateProgress(pct: number, step: string) {
      // BullMQ job reference not available here; progress is updated via job.updateProgress in the worker handler
      await updateTask(taskId, { progress: pct, currentStep: step });
    },
  };
}

function setupQueueEvents(queueName: string, queue: Queue) {
  const queueEvents = new QueueEvents(queueName, { connection: redis as never });

  queueEvents.on("completed", async ({ jobId, returnvalue }) => {
    try {
      const rv = typeof returnvalue === "string" ? JSON.parse(returnvalue) : returnvalue;
      if (rv?.taskId) {
        await updateTask(rv.taskId, {
          status: "success",
          finishedAt: new Date(),
          currentStep: "done",
          progress: 100,
          importedCount: rv.importedCount ?? 0,
          addedCount: rv.addedCount ?? 0,
          updatedCount: rv.updatedCount ?? 0,
          removedCount: rv.removedCount ?? 0,
        });
        logger.info(`Task ${rv.taskId} marked success`);
      }
    } catch (err) {
      logger.error(`Failed to process completed event for job ${jobId}`, { error: (err as Error).message });
    }
  });

  queueEvents.on("failed", async ({ jobId, failedReason }) => {
    try {
      const job = await queue.getJob(jobId);
      const taskId = job?.data?.taskId;
      if (!taskId) return;

      const errorMsg = (failedReason ?? "Unknown error").slice(0, 500);
      const jobState = await job.getState();

      if (jobState === "failed") {
        await updateTask(taskId, {
          status: "failed",
          finishedAt: new Date(),
          error: errorMsg,
          attemptsMade: job.attemptsMade,
        });
        logger.info(`Task ${taskId} marked failed (final)`);
      } else {
        await updateTask(taskId, {
          currentStep: "retrying",
          error: errorMsg,
          attemptsMade: job.attemptsMade,
        });
        logger.info(`Task ${taskId} attempt failed, will retry`, { attemptsMade: job.attemptsMade });
      }
    } catch (err) {
      logger.error(`Failed to process failed event for job ${jobId}`, { error: (err as Error).message });
    }
  });

  return queueEvents;
}

async function bootstrap() {
  const sourceSyncQueue = new Queue("source-sync", { connection: redis as never });
  const epgQueue = new Queue("epg", { connection: redis as never });

  // --- source-sync worker ---
  const sourceSyncWorker = new Worker(
    "source-sync",
    async (job) => {
      const { taskId, sourceId, sourceType } = job.data as SourceSyncJob;

      logger.info(`Processing job ${job.id}`, { name: job.name, taskId, sourceId, sourceType });

      await updateTask(taskId, {
        status: "running",
        currentStep: "starting",
        processedOn: new Date(),
      });

      const progress = {
        async updateProgress(pct: number, step: string) {
          await job.updateProgress(pct);
          await updateTask(taskId, { progress: pct, currentStep: step });
        },
      };

      let result: { importedCount: number; addedCount: number; updatedCount: number; removedCount: number };

      if (job.name === "m3u-sync") {
        result = await processM3uSync(sourceId, progress);
      } else if (job.name === "xmltv-sync") {
        result = await processXmltvSync(sourceId, progress);
      } else {
        throw new Error(`Unknown job name: ${job.name}`);
      }

      return {
        taskId,
        importedCount: result.importedCount,
        addedCount: result.addedCount,
        updatedCount: result.updatedCount,
        removedCount: result.removedCount,
      };
    },
    { connection: redis as never, concurrency: 2 },
  );

  // --- epg worker ---
  const epgWorker = new Worker(
    "epg",
    async (job) => {
      const { taskId, sourceId } = job.data as EpgJob;

      logger.info(`Processing epg job ${job.id}`, { name: job.name, taskId, sourceId });

      await updateTask(taskId, {
        status: "running",
        currentStep: "starting",
        processedOn: new Date(),
      });

      const progress = {
        async updateProgress(pct: number, step: string) {
          await job.updateProgress(pct);
          await updateTask(taskId, { progress: pct, currentStep: step });
        },
      };

      if (job.name === "epg-match") {
        const result = await processEpgMatch(sourceId, progress);
        return {
          taskId,
          importedCount: result.importedCount,
          addedCount: result.addedCount,
          updatedCount: result.updatedCount,
          removedCount: result.removedCount,
          matched: result.matched,
          unmatched: result.unmatched,
          conflicts: result.conflicts,
        };
      }

      if (job.name === "import-epg") {
        const result = await processXmltvSync(sourceId, progress);
        return {
          taskId,
          importedCount: result.importedCount,
          addedCount: result.addedCount,
          updatedCount: result.updatedCount,
          removedCount: result.removedCount,
        };
      }

      if (job.name === "refresh-epg") {
        const syncResult = await processXmltvSync(sourceId, progress);
        const matchResult = await processEpgMatch(sourceId, progress);
        return {
          taskId,
          importedCount: syncResult.importedCount,
          addedCount: syncResult.addedCount,
          updatedCount: matchResult.matched,
          removedCount: syncResult.removedCount,
        };
      }

      throw new Error(`Unknown epg job name: ${job.name}`);
    },
    { connection: redis as never, concurrency: 1 },
  );

  const sourceSyncEvents = setupQueueEvents("source-sync", sourceSyncQueue);
  const epgEvents = setupQueueEvents("epg", epgQueue);

  sourceSyncWorker.on("completed", (job) => logger.info(`Job ${job.id} completed`));
  sourceSyncWorker.on("failed", (job, err) => logger.error(`Job ${job?.id} failed`, { error: err.message }));
  epgWorker.on("completed", (job) => logger.info(`Epg job ${job.id} completed`));
  epgWorker.on("failed", (job, err) => logger.error(`Epg job ${job?.id} failed`, { error: err.message }));

  logger.info("Worker started (source-sync + epg queues)");

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await epgEvents.close();
    await sourceSyncEvents.close();
    await epgQueue.close();
    await sourceSyncQueue.close();
    await epgWorker.close();
    await sourceSyncWorker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err) => {
  logger.error("Worker failed to start", { error: err.message });
  process.exit(1);
});
