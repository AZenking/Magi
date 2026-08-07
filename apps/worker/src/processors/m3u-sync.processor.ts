/**
 * M3U source sync processor (rewritten by 009-m3u-control-plane T019).
 *
 * The legacy destructive path (DELETE raw_m3u_channels + DELETE channels +
 * re-insert) has been removed. The processor is now a thin adapter that
 * delegates per-source work to the source-scoped change-set pipeline:
 *
 *   1. Build a change set row (kind=m3u_sync, scope=source).
 *   2. Run PrepareM3uSyncUseCase to stage the snapshot + compute diff.
 *   3. If requiresConfirmation is false (normal diff), run ApplyM3uSyncUseCase
 *      atomically. Otherwise leave the change set in `ready` for operator
 *      confirmation (FR-016).
 *
 * The fan-out path (sourceId=null, scheduled job) iterates enabled sources and
 * syncs each one independently so a single source failure does not block
 * others.
 *
 * Cross-cutting concerns (lease, recovery, idempotency, audit) are owned by
 * the operation-worker handlers when the request comes through the API; this
 * processor only adds the inline equivalents for the legacy direct-trigger
 * paths (manual/scheduled) that don't go through the API.
 */
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import {
  m3uSources,
  operationChangeSets,
  sourceImportSnapshots,
} from "../schema";
import { DrizzleSourceSyncRepository } from "../infrastructure/database/source-sync.repository";
import { DrizzleOperationExecutionRepository } from "../infrastructure/database/operation-execution.repository";
import { PrepareM3uSyncUseCase } from "../application/operation-safety/prepare-m3u-sync.use-case";
import { ApplyM3uSyncUseCase } from "../application/operation-safety/apply-m3u-sync.use-case";
import type { SyncProgress } from "@magi/backend-core";

interface SyncResult {
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
}

/** Batch result when a scheduled sync fans out across all enabled sources. */
interface SyncBatchResult {
  totalSources: number;
  succeededSources: number;
  failedSources: number;
  results: Array<{
    sourceId: string;
    status: "success" | "failed" | "needs-confirmation";
    error?: string;
    changeSetId?: string;
  }>;
}

/**
 * Process an M3U source sync. When `sourceId` is null (scheduled/timer
 * invocation), fans out across all enabled M3U sources — each source is
 * synced independently so a single source failure does not block others.
 *
 * The actual mutation runs through PrepareM3uSyncUseCase + ApplyM3uSyncUseCase
 * (atomic apply path). No delete-and-reinsert.
 */
export async function processM3uSync(
  sourceId: string | null,
  progress?: SyncProgress,
): Promise<SyncResult | SyncBatchResult> {
  // Fan-out: scheduled jobs arrive with sourceId=null.
  if (!sourceId) {
    const enabledSources = await db
      .select({ id: m3uSources.id })
      .from(m3uSources)
      .where(eq(m3uSources.enabled, true));

    const results: SyncBatchResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < enabledSources.length; i++) {
      const sid = enabledSources[i]!.id;
      try {
        const r = await processOneSource(sid);
        if (r.requiresConfirmation) {
          results.push({
            sourceId: sid,
            status: "needs-confirmation",
            changeSetId: r.changeSetId,
          });
        } else {
          succeeded++;
          results.push({
            sourceId: sid,
            status: "success",
            changeSetId: r.changeSetId,
          });
        }
      } catch (error) {
        failed++;
        results.push({
          sourceId: sid,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await progress?.updateProgress(
        Math.round(((i + 1) / enabledSources.length) * 100),
        "batch-sync",
      );
    }

    return {
      totalSources: enabledSources.length,
      succeededSources: succeeded,
      failedSources: failed,
      results,
    };
  }

  // Single-source sync (manual trigger).
  const r = await processOneSource(sourceId);
  return {
    importedCount: r.upsertedCount,
    addedCount: r.createdCount,
    updatedCount: r.upsertedCount - r.createdCount,
    removedCount: r.missingMarkedCount,
  };
}

/**
 * Run prepare + (conditional) apply for a single source. Returns the
 * structured outcome so the caller can decide how to report
 * requiresConfirmation cases.
 */
async function processOneSource(sourceId: string): Promise<{
  changeSetId: string;
  snapshotId: string;
  requiresConfirmation: boolean;
  upsertedCount: number;
  createdCount: number;
  missingMarkedCount: number;
}> {
  const sourceSyncRepo = new DrizzleSourceSyncRepository();
  const operationExecRepo = new DrizzleOperationExecutionRepository();
  const prepareUc = new PrepareM3uSyncUseCase(sourceSyncRepo);
  const applyUc = new ApplyM3uSyncUseCase(
    sourceSyncRepo,
    (snapshotId: string) =>
      operationExecRepo.loadSnapshotItems(snapshotId) as Promise<{
        channelIdentity: string;
        collisionOrdinal: number;
        itemOrder: number;
        payload: {
          displayName: string;
          groupTitle: string | null;
          tvgId: string | null;
          tvgLogo: string | null;
          streamUrl: string | null;
        };
      }[]>,
  );

  const changeSetId = randomUUID();
  const preparedTaskId = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Persist the change set row in `preparing` (operation_change_sets).
  await db.insert(operationChangeSets).values({
    id: changeSetId,
    kind: "m3u_sync",
    status: "preparing",
    scopeType: "source",
    scopeId: sourceId,
    sourceId,
    inputFingerprint: "inline-trigger",
    baseVersions: {},
    summary: null,
    warnings: null,
    blockers: null,
    requestedBy: "schedule",
    prepareTaskId: preparedTaskId,
    applyTaskId: null,
    expiresAt,
    requiresConfirmation: false,
    sourceVersion: null,
    anomalyClassification: null,
    version: 1,
  });

  let prepareResult;
  try {
    prepareResult = await prepareUc.execute({
      sourceId,
      changeSetId,
      preparedTaskId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(operationChangeSets)
      .set({
        status: "failed",
        summary: { error: message.slice(0, 500) },
      })
      .where(eq(operationChangeSets.id, changeSetId));
    throw error;
  }

  // Persist the prepared snapshot + summary onto the change set, then decide
  // whether to auto-apply or surface for confirmation.
  await db
    .update(operationChangeSets)
    .set({
      status: "ready",
      snapshotId: prepareResult.snapshotId,
      summary: prepareResult.summary as unknown as Record<string, unknown>,
      warnings: prepareResult.warnings as unknown as never,
      requiresConfirmation: prepareResult.requiresConfirmation,
      sourceVersion: prepareResult.sourceVersion,
      anomalyClassification: {
        requiresConfirmation: prepareResult.requiresConfirmation,
        warnings: prepareResult.warnings,
      } as never,
    })
    .where(eq(operationChangeSets.id, changeSetId));

  if (prepareResult.requiresConfirmation) {
    // Anomaly: leave in `ready` for operator confirmation (FR-016).
    return {
      changeSetId,
      snapshotId: prepareResult.snapshotId,
      requiresConfirmation: true,
      upsertedCount: 0,
      createdCount: 0,
      missingMarkedCount: 0,
    };
  }

  // Normal diff: auto-apply via the atomic path.
  const applyResult = await applyUc.execute({
    sourceId,
    snapshotId: prepareResult.snapshotId,
    changeSetId,
    sourceVersion: prepareResult.sourceVersion,
    contentFingerprint: prepareResult.fingerprint,
  });

  await db
    .update(operationChangeSets)
    .set({
      status: "applied",
      applyTaskId: preparedTaskId,
    })
    .where(eq(operationChangeSets.id, changeSetId));

  return {
    changeSetId,
    snapshotId: prepareResult.snapshotId,
    requiresConfirmation: false,
    upsertedCount: applyResult.upsertedCount,
    createdCount: applyResult.createdCount,
    missingMarkedCount: applyResult.missingMarkedCount,
  };
}

// Re-export so callers that need to look up snapshot rows can do so without
// importing the schema barrel separately.
export { sourceImportSnapshots };
