/**
 * Worker entry point.
 *
 * Registers all job handlers (legacy processors + Safe Operations) with the
 * JobRunner, then starts BullMQ workers via worker-bootstrap. The bootstrap
 * layer owns Worker/QueueEvents lifecycle, concurrency, and shutdown.
 *
 * Each handler is a thin adapter: parse payload → call processor → return
 * result. The JobRunner handles markRunning/markSucceeded/markFailed +
 * progress reporting against sync_logs (constitution III boundary).
 */
import { QueueEvents, Queue } from "bullmq";
import { createLogger } from "@magi/utils";
import type { SyncProgress } from "@magi/backend-core";
import { redis } from "./redis";
import { db } from "./db";
import { operationChangeSets, syncLogs } from "./schema";
import { eq } from "drizzle-orm";
import { processM3uSync } from "./processors/m3u-sync.processor";
import { processXmltvSync } from "./processors/xmltv-sync.processor";
import { processEpgMatch } from "./processors/epg-match.processor";
import { processStreamCheck } from "./processors/stream-check.processor";
import { processSourceCheck } from "./processors/source-check.processor";
import { processCleanup } from "./processors/cleanup.processor";
import { startWorkers } from "./infrastructure/queue/worker-bootstrap";
import type { JobKind, JobProgress } from "./domain/job-execution/job.model";
import type { JobRunner } from "./application/job-runner";
import { AuditCompletionRepository } from "./infrastructure/database/audit-completion.repository";

const logger = createLogger({ context: "worker" });

// ---------------------------------------------------------------------------
// Queue definitions — single source of truth for queue ↔ kind mapping.
// ---------------------------------------------------------------------------
const QUEUE_CONFIG = [
  { queue: "source-sync", concurrency: 2, kinds: ["m3u-sync", "xmltv-sync", "source-check", "cleanup", "operation-prepare", "operation-apply"] as JobKind[] },
  { queue: "epg", concurrency: 1, kinds: ["epg-match", "import-epg", "refresh-epg"] as JobKind[] },
  { queue: "health-check", concurrency: 1, kinds: ["stream-check"] as JobKind[] },
] as const;

// ---------------------------------------------------------------------------
// Handler registration — maps each JobKind to its processor function.
// ---------------------------------------------------------------------------
function registerHandlers(runner: JobRunner) {
  // Adapter: JobProgress.update → SyncProgress.updateProgress for legacy processors.
  const toSyncProgress = (p: JobProgress): SyncProgress => ({
    updateProgress: p.update,
  });

  // --- source-sync handlers ---

  runner.register("m3u-sync", async (job, progress) => {
    const r = await processM3uSync(job.payload.sourceId as string, toSyncProgress(progress));
    return { taskId: job.payload.taskId as string, ...r };
  });

  runner.register("xmltv-sync", async (job, progress) => {
    const r = await processXmltvSync(job.payload.sourceId as string, toSyncProgress(progress));
    return { taskId: job.payload.taskId as string, ...r };
  });

  runner.register("source-check", async (job, progress) => {
    await processSourceCheck(job.payload.sourceType as string as "m3u" | "xmltv", job.payload.sourceId as string, toSyncProgress(progress));
    return { taskId: job.payload.taskId as string };
  });

  runner.register("cleanup", async (_job, progress) => {
    const r = await processCleanup(toSyncProgress(progress));
    return { taskId: _job.payload.taskId as string, importedCount: r.deletedTasks, removedCount: r.deletedOrphanChannels };
  });

  runner.register("operation-prepare", async (job, progress) => {
    const sourceId = job.payload.sourceId as string;
    const changeSetId = job.payload.changeSetId as string;
    const kind = job.payload.kind as string;
    const sp = toSyncProgress(progress);
    let result: { importedCount: number; addedCount: number; updatedCount: number; removedCount: number } | undefined;
    let error: string | null = null;

    try {
      if (kind === "epg_match") {
        const r = await processEpgMatch(sourceId, sp);
        result = { importedCount: r.importedCount, addedCount: r.addedCount, updatedCount: r.updatedCount, removedCount: r.removedCount };
      } else {
        result = await processM3uSync(sourceId, sp);
      }
    } catch (e) {
      error = (e as Error).message;
      logger.error(`operation-prepare failed for ${changeSetId}`, { error });
    }

    // Update change-set status so the UI unblocks.
    try {
      if (error) {
        await db.update(operationChangeSets).set({
          status: "failed",
          summary: { error: error.slice(0, 500) },
          warnings: [],
          blockers: [{ code: "sync-failed", message: error.slice(0, 200) }],
        }).where(eq(operationChangeSets.id, changeSetId));
      } else {
        await db.update(operationChangeSets).set({
          status: "ready",
          summary: { updated: result?.addedCount ?? 0, preserved: result?.updatedCount ?? 0 },
          warnings: [],
          blockers: [],
        }).where(eq(operationChangeSets.id, changeSetId));
      }
    } catch (csErr) {
      logger.error(`Failed to update change set ${changeSetId}`, { error: (csErr as Error).message });
    }

    return { taskId: job.payload.taskId as string, ...result };
  });

  runner.register("operation-apply", async (job) => {
    return { taskId: job.payload.taskId as string };
  });

  // --- epg handlers ---

  runner.register("epg-match", async (job, progress) => {
    const r = await processEpgMatch(job.payload.sourceId as string, toSyncProgress(progress));
    return { taskId: job.payload.taskId as string, ...r };
  });

  runner.register("import-epg", async (job, progress) => {
    const r = await processXmltvSync(job.payload.sourceId as string, toSyncProgress(progress));
    return { taskId: job.payload.taskId as string, ...r };
  });

  runner.register("refresh-epg", async (job, progress) => {
    const sp = toSyncProgress(progress);
    const syncResult = await processXmltvSync(job.payload.sourceId as string, sp);
    const matchResult = await processEpgMatch(job.payload.sourceId as string, sp);
    return {
      taskId: job.payload.taskId as string,
      importedCount: syncResult.importedCount,
      addedCount: syncResult.addedCount,
      updatedCount: matchResult.matched,
      removedCount: syncResult.removedCount,
    };
  });

  // --- health-check handlers ---

  runner.register("stream-check", async (job, progress) => {
    const r = await processStreamCheck(job.payload.sourceId as string | undefined, toSyncProgress(progress));
    return {
      taskId: job.payload.taskId as string,
      importedCount: r.checked,
      addedCount: r.online,
      updatedCount: r.degraded,
      removedCount: r.offline,
    };
  });
}

// ---------------------------------------------------------------------------
// Legacy QueueEvents — belt-and-suspenders for task status updates on
// scheduled/repeatable jobs that may race with the Worker handler.
// ---------------------------------------------------------------------------
function setupQueueEvents(queueName: string) {
  const queue = new Queue(queueName, { connection: redis as never });
  const events = new QueueEvents(queueName, { connection: redis as never });
  const auditCompletions = new AuditCompletionRepository();

  events.on("completed", async ({ returnvalue }) => {
    try {
      const rv = typeof returnvalue === "string" ? JSON.parse(returnvalue) : returnvalue;
      if (rv?.taskId) {
        await db.update(syncLogs).set({
          status: "success",
          finishedAt: new Date(),
          currentStep: "done",
          progress: 100,
          importedCount: rv.importedCount ?? 0,
          addedCount: rv.addedCount ?? 0,
          updatedCount: rv.updatedCount ?? 0,
          removedCount: rv.removedCount ?? 0,
        }).where(eq(syncLogs.id, rv.taskId));
        await auditCompletions.appendForTrackedTask({
          taskId: rv.taskId,
          result: "succeeded",
          summary: {
            importedCount: rv.importedCount ?? 0,
            addedCount: rv.addedCount ?? 0,
            updatedCount: rv.updatedCount ?? 0,
            removedCount: rv.removedCount ?? 0,
            matched: rv.matched ?? 0,
            unmatched: rv.unmatched ?? 0,
            conflicts: rv.conflicts ?? 0,
          },
        });
      }
    } catch (error) {
      logger.error("Failed to persist completed task projection or audit event", {
        queueName,
        error: (error as Error).message,
      });
    }
  });

  events.on("failed", async ({ jobId, failedReason }) => {
    try {
      const job = await queue.getJob(jobId);
      const taskId = job?.data?.taskId;
      if (!taskId) return;
      const jobState = await job.getState();
      if (jobState === "failed") {
        await db.update(syncLogs).set({
          status: "failed",
          finishedAt: new Date(),
          error: (failedReason ?? "Unknown error").slice(0, 500),
          attemptsMade: job.attemptsMade,
        }).where(eq(syncLogs.id, taskId));
        await auditCompletions.appendForTrackedTask({
          taskId,
          result: "failed",
          summary: { attemptsMade: job.attemptsMade },
          reason: failedReason ?? "Unknown error",
        });
      }
    } catch (error) {
      logger.error("Failed to persist failed task projection or audit event", {
        queueName,
        error: (error as Error).message,
      });
    }
  });

  return { events, queue };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap() {
  const stopWorkers = await startWorkers({
    queues: QUEUE_CONFIG,
    registerHandlers,
  });

  const eventAdapters = QUEUE_CONFIG.map((q) => setupQueueEvents(q.queue));

  logger.info("Worker started", {
    queues: QUEUE_CONFIG.map((q) => `${q.queue}(${q.kinds.join(",")})`).join(", "),
  });

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await stopWorkers();
    await Promise.all(eventAdapters.map((a) => a.events.close()));
    await Promise.all(eventAdapters.map((a) => a.queue.close()));
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err) => {
  logger.error("Worker failed to start", { error: err.message });
  process.exit(1);
});
