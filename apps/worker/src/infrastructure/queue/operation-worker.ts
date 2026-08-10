/**
 * Operation worker registration (008-pipeline-reliability T024-T029).
 *
 * Registers the Safe Operations job handlers (operation-prepare/apply/restore/
 * cleanup) with the JobRunner. Wires concrete Worker use cases to their
 * Drizzle-backed repository adapters.
 *
 * T023 removed the inline shadowing handlers from main.ts so this function
 * is now actually called by worker-bootstrap.ts.
 */
import { eq } from "drizzle-orm";
import type { JobRunner } from "@/application/job-runner";
import type { Job, JobProgress, JobResult } from "@/domain/job-execution";
import { db } from "../../db";
import { operationChangeSets, recoveryPoints, recoveryPointItems } from "../../schema";
import { DrizzleSourceSyncRepository } from "../database/source-sync.repository";
import { DrizzleEpgSyncRepository } from "../database/epg-sync.repository";
import { DrizzleCanonicalReconcileRepository } from "../database/canonical-reconcile.repository";
import { DrizzleRestoreRepository } from "../database/restore.repository";
import { DrizzleOperationExecutionRepository } from "../database/operation-execution.repository";
import { PrepareM3uSyncUseCase } from "@/application/operation-safety/prepare-m3u-sync.use-case";
import { ApplyM3uSyncUseCase } from "@/application/operation-safety/apply-m3u-sync.use-case";
import {
  ApplySourceDeleteUseCase,
  PrepareSourceDeleteUseCase,
} from "@/application/operation-safety/source-delete.use-cases";
import { PrepareEpgMatchUseCase } from "@/application/operation-safety/prepare-epg-match.use-case";
import { ApplyEpgMatchUseCase } from "@/application/operation-safety/apply-epg-match.use-case";
import { ReconcileCanonicalChannelsUseCase } from "@/application/operation-safety/reconcile-canonical-channels.use-case";
import { ApplyRecoveryRestoreUseCase } from "@/application/operation-safety/apply-recovery-restore.use-case";
import { CleanupOperationStateUseCase } from "@/application/operation-safety/cleanup-operation-state.use-case";

function messageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (!(error.cause instanceof Error) || error.cause.message === error.message) {
    return error.message;
  }
  return `${error.message}: ${error.cause.message}`;
}

export function registerOperationHandlers(runner: JobRunner): void {
  // Instantiate adapters + use cases once.
  const sourceSyncRepo = new DrizzleSourceSyncRepository();
  const epgSyncRepo = new DrizzleEpgSyncRepository();
  const reconcileRepo = new DrizzleCanonicalReconcileRepository();
  const restoreRepo = new DrizzleRestoreRepository();
  const operationExecRepo = new DrizzleOperationExecutionRepository();

  const prepareM3u = new PrepareM3uSyncUseCase(sourceSyncRepo);
  const prepareSourceDelete = new PrepareSourceDeleteUseCase(sourceSyncRepo);
  const applySourceDelete = new ApplySourceDeleteUseCase(sourceSyncRepo);
  const applyM3u = new ApplyM3uSyncUseCase(
    sourceSyncRepo,
    (snapshotId: string) => operationExecRepo.loadSnapshotItems(snapshotId) as Promise<{
      channelIdentity: string;
      collisionOrdinal: number;
      itemOrder: number;
      payload: { displayName: string; groupTitle: string | null; tvgId: string | null; tvgLogo: string | null; streamUrl: string | null };
    }[]>,
  );
  const prepareEpg = new PrepareEpgMatchUseCase(epgSyncRepo);
  const applyEpg = new ApplyEpgMatchUseCase(epgSyncRepo);
  const reconcile = new ReconcileCanonicalChannelsUseCase(reconcileRepo);
  const restoreUc = new ApplyRecoveryRestoreUseCase(restoreRepo);
  const cleanupUc = new CleanupOperationStateUseCase(operationExecRepo);

  // T025: operation-prepare — preview without side effects.
  runner.register("operation-prepare", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    const changeSetId = job.payload.changeSetId as string;
    const kind = job.payload.kind as string;
    const sourceId = job.payload.sourceId as string;

    try {
      let summary: Record<string, unknown> = {};

      if (kind === "source_delete") {
        // A source-delete preview must not download or require an enabled M3U
        // source. It is a source-scoped database impact query instead.
        const result = await prepareSourceDelete.execute(sourceId);
        summary = { ...result.counts };
      } else if (kind === "epg_match") {
        const result = await prepareEpg.execute({ xmltvSourceId: sourceId });
        summary = { exact: result.summary?.exact ?? 0, fuzzy: result.summary?.fuzzy ?? 0, unmatched: result.summary?.unmatched ?? 0 };
      } else {
        const result = await prepareM3u.execute({
          sourceId,
          changeSetId,
          preparedTaskId: job.payload.taskId as string,
        });
        summary = { added: result.summary?.added ?? 0, updated: result.summary?.updated ?? 0, missing: result.summary?.missing ?? 0 };
      }

      await db.update(operationChangeSets).set({
        status: "ready",
        summary,
        warnings: [],
        blockers: [],
      }).where(eq(operationChangeSets.id, changeSetId));

      return { taskId: job.payload.taskId, importedCount: 0 };
    } catch (error) {
      const message = messageWithCause(error);
      await db.update(operationChangeSets).set({
        status: "failed",
        summary: { error: message.slice(0, 500) },
        warnings: [],
        blockers: [{
          code: kind === "source_delete" && message === "Source not found"
            ? "source-not-found"
            : "prepare-failed",
          message: message.slice(0, 200),
        }],
      }).where(eq(operationChangeSets.id, changeSetId));
      return { taskId: job.payload.taskId, importedCount: 0 };
    }
  });

  // T026: operation-apply — atomically apply the change set.
  runner.register("operation-apply", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    const changeSetId = job.payload.changeSetId as string;
    const kind = job.payload.kind as string;
    const sourceId = job.payload.sourceId as string;
    const snapshotId = job.payload.snapshotId as string | undefined;
    // 009: thread sourceVersion so the atomic-apply path can reject stale
    // snapshots taken against an older source config row.
    const sourceVersion = job.payload.sourceVersion as number | undefined;

    try {
      let appliedCount = 0;

      if (kind === "source_delete") {
        const result = await applySourceDelete.execute(sourceId);
        appliedCount = result.deleted ? 1 : 0;
      } else if (kind === "epg_match") {
        const result = await applyEpg.execute({ approvedBindings: [] });
        appliedCount = result.appliedCount ?? 0;
      } else if (snapshotId) {
        // 009: route through the atomic-apply path so stable upsert + missing
        // marking + source status bump + recovery items run in one transaction.
        const result = await applyM3u.execute({
          sourceId,
          snapshotId,
          changeSetId,
          sourceVersion: sourceVersion ?? undefined,
        });
        appliedCount = result.upsertedCount ?? 0;
      }

      // A source delete removes source-derived rows and intentionally leaves
      // durable canonical channels alone; there is no source-channel set to
      // reconcile after it. M3U sync keeps the post-apply reconciliation path.
      if (kind !== "source_delete") {
        // 009: load the source channels post-apply so the reconcile use case has
        // real tvg-id / display name / group data to drive auto-merge + weak-
        // match candidates (replaces the legacy empty-array call).
        const presentChannels = await sourceSyncRepo.loadPresentChannels(sourceId);
        const currentChannels = await sourceSyncRepo.loadCurrentChannels(sourceId);
        const missingIds = currentChannels
          .filter((c) => c.sourcePresence === "missing")
          .map((c) => c.id);

        await reconcile.execute({
          sourceId,
          sourceChannels: presentChannels.map((c) => ({
            sourceChannelId: c.id,
            channelIdentity: c.channelIdentity,
            displayName: c.displayName,
            groupTitle: null,
            tvgId: c.tvgId,
            normalizedName: null,
            normalizedGroup: null,
            streamUrl: null,
            sourceFingerprint: "post-apply",
          })),
          missingSourceChannelIds: missingIds,
        });
      }

      await db.update(operationChangeSets).set({
        status: "applied",
        updatedAt: new Date(),
      }).where(eq(operationChangeSets.id, changeSetId));

      return { taskId: job.payload.taskId, importedCount: appliedCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(operationChangeSets).set({
        status: "failed",
        summary: { error: message.slice(0, 500) },
      }).where(eq(operationChangeSets.id, changeSetId));
      return { taskId: job.payload.taskId, importedCount: 0 };
    }
  });

  // T027: operation-restore — roll back via recovery point.
  runner.register("operation-restore", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    const recoveryPointId = job.payload.recoveryPointId as string;

    const items = await db
      .select()
      .from(recoveryPointItems)
      .where(eq(recoveryPointItems.recoveryPointId, recoveryPointId))
      .orderBy(recoveryPointItems.itemOrder);

    const restoreItems = items
      .filter((item) => item.entityId !== null)
      .map((item) => ({
        entityType: item.entityType,
        entityId: item.entityId!,
        entityVersion: item.entityVersion ?? 1,
        payload: item.payload as Record<string, unknown>,
        itemOrder: item.itemOrder ?? 0,
      }));

    const result = await restoreUc.execute({ recoveryPointId, items: restoreItems });

    await db.update(recoveryPoints).set({
      status: "restored",
    }).where(eq(recoveryPoints.id, recoveryPointId));

    return { taskId: job.payload.taskId, importedCount: result.restoredCount };
  });

  // T029: operation-cleanup — expire stale operation state.
  runner.register("operation-cleanup", async (job: Job, _progress: JobProgress): Promise<JobResult> => {
    const result = await cleanupUc.execute({});
    return {
      taskId: job.payload.taskId,
      importedCount: result.expiredChangeSets + result.expiredSnapshots + result.expiredIdempotencyRecords + result.reclaimedLeases,
    };
  });
}
