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
import { and, eq, sql } from "drizzle-orm";
import type { JobRunner } from "@/application/job-runner";
import type { Job, JobProgress, JobResult } from "@/domain/job-execution";
import { db } from "../../db";
import {
  operationChangeSets,
  recoveryPoints,
  recoveryPointItems,
} from "../../schema";
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
import { refreshOutputPublication } from "../database/output-publication.repository";

function messageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (
    !(error.cause instanceof Error) ||
    error.cause.message === error.message
  ) {
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
    (snapshotId: string) =>
      operationExecRepo.loadSnapshotItems(snapshotId) as Promise<
        {
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
        }[]
      >,
  );
  const prepareEpg = new PrepareEpgMatchUseCase(epgSyncRepo);
  const applyEpg = new ApplyEpgMatchUseCase(epgSyncRepo);
  const reconcile = new ReconcileCanonicalChannelsUseCase(reconcileRepo);
  const restoreUc = new ApplyRecoveryRestoreUseCase(restoreRepo);
  const cleanupUc = new CleanupOperationStateUseCase(operationExecRepo);

  /** Compensate a committed source apply when canonical reconciliation fails. */
  async function compensateRecoveryPoint(
    recoveryPointId: string,
  ): Promise<boolean> {
    const [recoveryPoint] = await db
      .select({ status: recoveryPoints.status })
      .from(recoveryPoints)
      .where(eq(recoveryPoints.id, recoveryPointId))
      .limit(1);
    // `ready` means applyAtomic committed and captured the pre-apply graph.
    // A `creating` point means the transaction rolled back before any domain
    // mutation, so restoring it would be both unnecessary and unsafe.
    if (!recoveryPoint || recoveryPoint.status !== "ready") return false;

    const items = await db
      .select()
      .from(recoveryPointItems)
      .where(eq(recoveryPointItems.recoveryPointId, recoveryPointId))
      .orderBy(recoveryPointItems.itemOrder);
    await restoreUc.execute({
      recoveryPointId,
      items: items
        .filter((item) => item.entityId !== null)
        .map((item) => ({
          entityType: item.entityType,
          entityId: item.entityId!,
          entityVersion: item.entityVersion ?? 1,
          payload: item.payload as Record<string, unknown>,
          itemOrder: item.itemOrder ?? 0,
        })),
    });
    await db
      .update(recoveryPoints)
      .set({ status: "restored" })
      .where(eq(recoveryPoints.id, recoveryPointId));
    return true;
  }

  const leaseTtlMs = 2 * 60 * 1000;

  async function acquireWorkerLease(
    job: Job,
    scopeKey: string | undefined,
    preferredOwnerId?: string,
  ): Promise<{
    scopeKey: string;
    ownerId: string;
    stopHeartbeat: () => void;
  }> {
    if (!scopeKey) throw new Error("Operation lease scope is required");
    const ownerId = preferredOwnerId ?? (job.payload.taskId as string);
    if (!ownerId) throw new Error("Operation lease owner is required");
    const lease = await operationExecRepo.acquireLease(
      scopeKey,
      ownerId,
      leaseTtlMs,
    );
    if (!lease.acquired && lease.ownerTaskId !== ownerId) {
      throw new Error(`Operation already in progress for ${scopeKey}`);
    }
    // This both verifies an API-created lease and extends it for the actual
    // Worker execution window. A no-op heartbeat is safe for a just-acquired
    // row and an ownership mismatch is surfaced by the implementation.
    await operationExecRepo.heartbeatLease(scopeKey, ownerId);
    const heartbeatTimer = setInterval(() => {
      void operationExecRepo.heartbeatLease(scopeKey, ownerId).catch(() => {
        // The apply path still performs its snapshot/version checks; a lost
        // heartbeat is intentionally not converted into an unsafe release.
      });
    }, 30_000);
    heartbeatTimer.unref?.();
    return {
      scopeKey,
      ownerId,
      stopHeartbeat: () => clearInterval(heartbeatTimer),
    };
  }

  async function releaseWorkerLease(
    lease: {
      scopeKey: string;
      ownerId: string;
      stopHeartbeat: () => void;
    } | null,
  ): Promise<void> {
    if (!lease) return;
    lease.stopHeartbeat();
    await operationExecRepo.releaseLease(lease.scopeKey, lease.ownerId);
  }

  // T025: operation-prepare — preview without side effects.
  runner.register(
    "operation-prepare",
    async (job: Job, _progress: JobProgress): Promise<JobResult> => {
      const changeSetId = job.payload.changeSetId as string;
      const kind = job.payload.kind as string;
      const sourceId = job.payload.sourceId as string;
      const baseVersions = (job.payload.baseVersions ?? {}) as Record<
        string,
        number
      >;
      const leaseScope = job.payload.leaseScope as string | undefined;
      let lease: {
        scopeKey: string;
        ownerId: string;
        stopHeartbeat: () => void;
      } | null = null;

      try {
        if (
          kind === "m3u_sync" ||
          kind === "source_delete" ||
          kind === "recovery_restore"
        ) {
          lease = await acquireWorkerLease(
            job,
            leaseScope ??
              (kind === "recovery_restore"
                ? `recovery-restore:${job.payload.scopeId as string}`
                : `m3u-control-plane:source:${sourceId}`),
          );
        }
        let summary: Record<string, unknown> = {};
        let m3uPrepareResult: Awaited<
          ReturnType<PrepareM3uSyncUseCase["execute"]>
        > | null = null;

        if (kind === "source_delete") {
          // A source-delete preview must not download or require an enabled M3U
          // source. It is a source-scoped database impact query instead.
          const result = await prepareSourceDelete.execute(sourceId);
          const expectedSourceVersion =
            baseVersions[`source:${sourceId}`] ?? baseVersions[sourceId];
          if (
            expectedSourceVersion !== undefined &&
            result.sourceVersion !== expectedSourceVersion
          ) {
            throw new Error(
              `Stale source version: expected ${expectedSourceVersion}, current ${result.sourceVersion ?? 1}`,
            );
          }
          summary = {
            ...result.counts,
            // Keep the reversible alternative in the preview payload so every
            // client can present disable-first without reconstructing policy.
            disableSource: {
              enabled: true,
              summary:
                "停用来源是可恢复的替代方案：保留配置但停止同步与输出参与。",
            },
          };
        } else if (kind === "recovery_restore") {
          const parameters = (job.payload.parameters ?? {}) as {
            recoveryPointId?: string;
          };
          const recoveryPointId =
            parameters.recoveryPointId ?? (job.payload.scopeId as string);
          const [recoveryPoint] = await db
            .select({
              status: recoveryPoints.status,
              expiresAt: recoveryPoints.expiresAt,
            })
            .from(recoveryPoints)
            .where(eq(recoveryPoints.id, recoveryPointId))
            .limit(1);
          if (
            !recoveryPoint ||
            recoveryPoint.status !== "ready" ||
            (recoveryPoint.expiresAt != null &&
              recoveryPoint.expiresAt.getTime() <= Date.now())
          ) {
            throw new Error("Recovery point is invalid or expired");
          }
          const [countRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(recoveryPointItems)
            .where(eq(recoveryPointItems.recoveryPointId, recoveryPointId));
          summary = { restoreItems: Number(countRow?.count ?? 0) };
        } else if (kind === "epg_match") {
          const result = await prepareEpg.execute({ xmltvSourceId: sourceId });
          summary = {
            exact: result.summary?.exact ?? 0,
            fuzzy: result.summary?.fuzzy ?? 0,
            unmatched: result.summary?.unmatched ?? 0,
          };
        } else {
          m3uPrepareResult = await prepareM3u.execute({
            sourceId,
            changeSetId,
            preparedTaskId: job.payload.taskId as string,
            expectedSourceVersion:
              baseVersions[`source:${sourceId}`] ?? baseVersions[sourceId],
          });
          summary = {
            added: m3uPrepareResult.summary?.added ?? 0,
            updated: m3uPrepareResult.summary?.updated ?? 0,
            missing: m3uPrepareResult.summary?.missing ?? 0,
            conflicts: m3uPrepareResult.summary?.conflicts ?? 0,
          };
          if (m3uPrepareResult.requiresConfirmation) {
            await refreshOutputPublication({
              changeSetId,
              status: "blocked",
              blockingReason: m3uPrepareResult.warnings
                .map((warning) => warning.message)
                .join("; ")
                .slice(0, 500),
            });
          }
        }

        const m3uFields = m3uPrepareResult
          ? {
              snapshotId: m3uPrepareResult.snapshotId,
              sourceVersion: m3uPrepareResult.sourceVersion,
              requiresConfirmation: m3uPrepareResult.requiresConfirmation,
              anomalyClassification: {
                requiresConfirmation: m3uPrepareResult.requiresConfirmation,
                warnings: m3uPrepareResult.warnings,
              },
            }
          : {};
        await db
          .update(operationChangeSets)
          .set({
            status: "ready",
            summary,
            warnings: m3uPrepareResult?.warnings ?? [],
            blockers:
              m3uPrepareResult && m3uPrepareResult.summary.conflicts > 0
                ? [
                    {
                      code: "duplicate-identity",
                      message:
                        "Duplicate source identities must be resolved before apply",
                    },
                  ]
                : [],
            version: sql`${operationChangeSets.version} + 1`,
            ...m3uFields,
          })
          .where(
            and(
              eq(operationChangeSets.id, changeSetId),
              eq(operationChangeSets.status, "preparing"),
            ),
          );

        return { taskId: job.payload.taskId, importedCount: 0 };
      } catch (error) {
        const message = messageWithCause(error);
        await db
          .update(operationChangeSets)
          .set({
            status: "failed",
            summary: { error: message.slice(0, 500) },
            warnings: [],
            blockers: [
              {
                code:
                  kind === "source_delete" && message === "Source not found"
                    ? "source-not-found"
                    : "prepare-failed",
                message: message.slice(0, 200),
              },
            ],
            version: sql`${operationChangeSets.version} + 1`,
          })
          .where(
            and(
              eq(operationChangeSets.id, changeSetId),
              eq(operationChangeSets.status, "preparing"),
            ),
          );
        throw error;
      } finally {
        await releaseWorkerLease(lease);
      }
    },
  );

  // T026: operation-apply — atomically apply the change set.
  runner.register(
    "operation-apply",
    async (job: Job, _progress: JobProgress): Promise<JobResult> => {
      const changeSetId = job.payload.changeSetId as string;
      const kind = job.payload.kind as string;
      const sourceId = job.payload.sourceId as string;
      const snapshotId = job.payload.snapshotId as string | undefined;
      const recoveryPointId = job.payload.recoveryPointId as string | undefined;
      const leaseScope = job.payload.leaseScope as string | undefined;
      const leaseTaskId = job.payload.leaseTaskId as string | undefined;
      let lease: {
        scopeKey: string;
        ownerId: string;
        stopHeartbeat: () => void;
      } | null = null;
      // 009: thread sourceVersion so the atomic-apply path can reject stale
      // snapshots taken against an older source config row.
      const sourceVersion = job.payload.sourceVersion as number | undefined;
      const baseVersions = (job.payload.baseVersions ?? {}) as Record<
        string,
        number
      >;

      try {
        if (
          (kind === "m3u_sync" ||
            kind === "source_delete" ||
            kind === "recovery_restore") &&
          (sourceId || kind === "recovery_restore")
        ) {
          lease = await acquireWorkerLease(
            job,
            leaseScope ??
              (kind === "recovery_restore"
                ? `recovery-restore:${job.payload.scopeId as string}`
                : `m3u-control-plane:source:${sourceId}`),
            leaseTaskId,
          );
        }
        let appliedCount = 0;

        if (kind === "source_delete") {
          const expectedSourceVersion =
            baseVersions[`source:${sourceId}`] ?? baseVersions[sourceId];
          const result = await applySourceDelete.execute(
            sourceId,
            recoveryPointId ? { recoveryPointId, changeSetId } : undefined,
            expectedSourceVersion,
          );
          appliedCount = result.deleted ? 1 : 0;
        } else if (kind === "recovery_restore") {
          const targetRecoveryPointId =
            recoveryPointId ?? (job.payload.scopeId as string);
          const items = await db
            .select()
            .from(recoveryPointItems)
            .where(
              eq(recoveryPointItems.recoveryPointId, targetRecoveryPointId),
            )
            .orderBy(recoveryPointItems.itemOrder);
          const result = await restoreUc.execute({
            recoveryPointId: targetRecoveryPointId,
            items: items
              .filter((item) => item.entityId !== null)
              .map((item) => ({
                entityType: item.entityType,
                entityId: item.entityId!,
                entityVersion: item.entityVersion ?? 1,
                payload: item.payload as Record<string, unknown>,
                itemOrder: item.itemOrder ?? 0,
              })),
          });
          await db
            .update(recoveryPoints)
            .set({ status: "restored" })
            .where(eq(recoveryPoints.id, targetRecoveryPointId));
          appliedCount = result.restoredCount;
        } else if (kind === "epg_match") {
          const result = await applyEpg.execute({ approvedBindings: [] });
          appliedCount = result.appliedCount ?? 0;
        } else if (snapshotId) {
          const expectedSourceVersion =
            baseVersions[`source:${sourceId}`] ?? baseVersions[sourceId];
          if (
            expectedSourceVersion !== undefined &&
            sourceVersion !== undefined &&
            sourceVersion !== expectedSourceVersion
          ) {
            throw new Error(
              `Stale source version: expected ${expectedSourceVersion}, prepared ${sourceVersion}`,
            );
          }
          // 009: route through the atomic-apply path so stable upsert + missing
          // marking + source status bump + recovery items run in one transaction.
          const result = await applyM3u.execute({
            sourceId,
            snapshotId,
            changeSetId,
            sourceVersion: sourceVersion ?? undefined,
            recoveryPointId,
            contentFingerprint:
              (await operationExecRepo.loadSnapshotFingerprint(snapshotId)) ??
              undefined,
          });
          appliedCount = result.upsertedCount ?? 0;
        }

        // A source delete removes source-derived rows and intentionally leaves
        // durable canonical channels alone; there is no source-channel set to
        // reconcile after it. M3U sync keeps the post-apply reconciliation path.
        if (kind === "m3u_sync") {
          // 009: load the source channels post-apply so the reconcile use case has
          // real tvg-id / display name / group data to drive auto-merge + weak-
          // match candidates (replaces the legacy empty-array call).
          const presentChannels =
            await sourceSyncRepo.loadPresentChannels(sourceId);
          const currentChannels =
            await sourceSyncRepo.loadCurrentChannels(sourceId);
          const missingIds = currentChannels
            .filter((c) => c.sourcePresence === "missing")
            .map((c) => c.id);

          const sourceFingerprint = snapshotId
            ? await operationExecRepo.loadSnapshotFingerprint(snapshotId)
            : null;
          if (!sourceFingerprint)
            throw new Error("Snapshot fingerprint not found");
          await reconcile.execute({
            sourceId,
            sourceChannels: presentChannels.map((c) => ({
              sourceChannelId: c.id,
              channelIdentity: c.channelIdentity,
              displayName: c.displayName,
              groupTitle: c.groupTitle,
              tvgId: c.tvgId,
              normalizedName: null,
              normalizedGroup: c.groupTitle,
              streamUrl: c.streamUrl,
              sourceFingerprint,
            })),
            missingSourceChannelIds: missingIds,
          });
          await refreshOutputPublication({
            changeSetId,
            status: "fresh",
            blockingReason: null,
          });
        } else if (kind === "source_delete") {
          await refreshOutputPublication({
            changeSetId,
            status: "fresh",
            blockingReason: null,
          });
        } else if (kind === "recovery_restore") {
          await refreshOutputPublication({
            changeSetId,
            status: "fresh",
            blockingReason: null,
          });
        }

        await db
          .update(operationChangeSets)
          .set({
            status: "applied",
            updatedAt: new Date(),
            version: sql`${operationChangeSets.version} + 1`,
          })
          .where(
            and(
              eq(operationChangeSets.id, changeSetId),
              eq(operationChangeSets.status, "applying"),
            ),
          );

        return { taskId: job.payload.taskId, importedCount: appliedCount };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          kind === "m3u_sync" ||
          kind === "source_delete" ||
          kind === "recovery_restore"
        ) {
          await refreshOutputPublication({
            changeSetId,
            status: "stale",
            blockingReason: message.slice(0, 500),
          }).catch(() => undefined);
        }
        if (recoveryPointId && kind !== "recovery_restore") {
          let restored = false;
          try {
            restored = await compensateRecoveryPoint(recoveryPointId);
          } catch {
            // Keep the recovery point explicitly invalid when compensation
            // itself cannot complete; the operator can still inspect it.
          }
          if (!restored) {
            await db
              .update(recoveryPoints)
              .set({ status: "invalid" })
              .where(eq(recoveryPoints.id, recoveryPointId));
          }
        }
        await db
          .update(operationChangeSets)
          .set({
            status: "failed",
            summary: { error: message.slice(0, 500) },
            version: sql`${operationChangeSets.version} + 1`,
          })
          .where(
            and(
              eq(operationChangeSets.id, changeSetId),
              eq(operationChangeSets.status, "applying"),
            ),
          );
        throw error;
      } finally {
        await releaseWorkerLease(lease);
      }
    },
  );

  // T027: operation-restore — roll back via recovery point.
  runner.register(
    "operation-restore",
    async (job: Job, _progress: JobProgress): Promise<JobResult> => {
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

      const result = await restoreUc.execute({
        recoveryPointId,
        items: restoreItems,
      });

      await db
        .update(recoveryPoints)
        .set({
          status: "restored",
        })
        .where(eq(recoveryPoints.id, recoveryPointId));

      return {
        taskId: job.payload.taskId,
        importedCount: result.restoredCount,
      };
    },
  );

  // T029: operation-cleanup — expire stale operation state.
  runner.register(
    "operation-cleanup",
    async (job: Job, _progress: JobProgress): Promise<JobResult> => {
      const result = await cleanupUc.execute({});
      return {
        taskId: job.payload.taskId,
        importedCount:
          result.expiredChangeSets +
          result.expiredSnapshots +
          result.expiredIdempotencyRecords +
          result.reclaimedLeases,
      };
    },
  );
}
