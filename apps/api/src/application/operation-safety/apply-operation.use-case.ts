/**
 * ApplyOperationUseCase (T036; 009-m3u-control-plane T018 adds the
 * requiresConfirmation gate, snapshotId/sourceVersion propagation to the
 * Worker apply job, and source-scoped leaseScope on enqueue).
 *
 * Orchestrates the safe apply protocol (research §1, contracts/operation-previews.md):
 *   1. verify ready / not expired
 *   2. verify input fingerprint + every base version (stale => 409 preview-stale)
 *   3. verify warnings acknowledged + blockers zero (009: requiresConfirmation)
 *   4. acquire the operation scope lease (mutual exclusion)
 *   5. create + verify a recovery point (creation failure => zero writes, FR-018)
 *   6. enqueue the Worker apply job with Idempotency-Key semantics
 *
 * The actual object mutation happens in the Worker (T037/T039); this use case
 * only validates, checkpoints, and dispatches. No partial apply is exposed as
 * success.
 */
import { randomUUID } from "node:crypto";
import {
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  IOperationChangeSetRepository,
  IOperationLeaseRepository,
  IRecoveryPointRepository,
} from "@/domain/operation-safety";
import {
  extractWarningCodes,
  type OperationChangeSet,
} from "@/domain/operation-safety/operation-change-set.model";
import type { ITaskRepository } from "@/domain/task-execution";
import type { TaskQueuePort } from "@/domain/task-execution/task-queue.port";
import type { IdempotencyRepository } from "@/infrastructure/database/idempotency.repository";
import { leaseScopeFor } from "@/application/operation-safety/m3u-control-plane-jobs";
import { currentRequestId } from "@/shared/http/request-context.middleware";

export type { OperationChangeSet };

export interface ApplyOperationInput {
  readonly changeSetId: string;
  readonly expectedVersion: number;
  readonly confirmedWarningCodes: readonly string[];
  readonly operatorReason?: string;
  readonly idempotencyKey?: string;
  readonly actorId: string;
  readonly requestId?: string;
}

export interface ApplyOperationResult {
  readonly taskId: string;
  readonly changeSetId: string;
  readonly recoveryPointId: string;
  readonly statusUrl: string;
  readonly deduplicated: boolean;
}

const LEASE_TTL_MS = 2 * 60 * 1000;

export class ApplyOperationUseCase {
  constructor(
    private readonly changeSets: IOperationChangeSetRepository,
    private readonly leases: IOperationLeaseRepository,
    private readonly recoveryPoints: IRecoveryPointRepository,
    private readonly tasks: ITaskRepository,
    private readonly queue: TaskQueuePort,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  async execute(input: ApplyOperationInput): Promise<ApplyOperationResult> {
    // --- Idempotency check (T009). Same key + same fingerprint replays. ---
    if (input.idempotencyKey) {
      const fp = `${input.changeSetId}:${input.expectedVersion}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const recorded = await this.idempotency.tryRecord({
        actorId: input.actorId,
        command: "operation-apply",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fp,
        expiresAt,
      });
      if (!recorded.recorded && recorded.hit.matchedFingerprint && recorded.hit.responseRef) {
        // Replay the original TaskRef.
        const ref = recorded.hit.responseRef as { taskId: string; changeSetId: string; recoveryPointId: string };
        return { ...ref, statusUrl: `/tasks/${ref.taskId}`, deduplicated: true };
      }
      if (!recorded.recorded && !recorded.hit.matchedFingerprint) {
        throw new ConflictException({
          code: "idempotency-key-reused",
          title: "Idempotency key reused with a different request",
          status: 409,
        });
      }
    }

    // --- 1. verify ready / not expired ---
    const cs = await this.changeSets.findById(input.changeSetId);
    if (!cs) throw new ConflictException({ code: "resource-not-found", status: 404 });
    if (cs.status !== "ready") {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `Change set is ${cs.status}, not ready`,
        status: 409,
      });
    }
    if (cs.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({ code: "preview-expired", status: 410 });
    }
    if (cs.version !== input.expectedVersion) {
      throw new ConflictException({
        code: "stale-resource",
        status: 412,
        currentVersion: cs.version,
      });
    }

    // --- 2. verify base versions (caller passes via change-set snapshot; the
    //     Worker re-checks the fingerprint atomically). Here we only assert the
    //     change set is still the same version, which is the cheap precondition. ---

    // --- 3. blockers must be zero; required warnings acknowledged ---
    // 009-m3u-control-plane T018: requiresConfirmation gate. When the change
    // set is flagged requiresConfirmation (FR-016), the operator MUST confirm
    // every anomaly warning code before apply can proceed. Same shape covers
    // future blocker codes — anything in cs.warnings the operator hasn't
    // acknowledged blocks the apply.
    if (cs.requiresConfirmation) {
      const requiredCodes = extractWarningCodes(cs);
      const confirmed = new Set(input.confirmedWarningCodes);
      const missing = requiredCodes.filter((code) => !confirmed.has(code));
      if (missing.length > 0) {
        throw new ConflictException({
          code: "confirmation-required",
          title: "Anomalous change set requires explicit operator confirmation",
          status: 409,
          missingWarningCodes: missing,
          requiresConfirmation: true,
        });
      }
    }

    // --- 4. acquire the scope lease ---
    const scopeKey = `${cs.scopeType}:${cs.scopeId}`;
    void randomUUID; // kept for potential future use
    const pendingTaskId = randomUUID();
    const lease = await this.leases.acquireOrReturnExisting(
      scopeKey,
      cs.kind,
      pendingTaskId,
      cs.id,
      LEASE_TTL_MS,
    );
    if (!lease.acquired && lease.ownerTaskId) {
      throw new ConflictException({
        code: "operation-in-progress",
        title: "A mutually exclusive task already owns this scope",
        status: 409,
      });
    }

    // --- 5. create recovery point (creation failure => zero writes, FR-018) ---
    let recoveryPointId: string;
    try {
      const rp = await this.recoveryPoints.create({
        status: "creating",
        operationKind: cs.kind,
        scopeType: cs.scopeType,
        scopeId: cs.scopeId,
        changeSetId: cs.id,
        taskId: pendingTaskId,
        schemaVersion: 1,
        itemCount: 0, // Worker fills the real count during apply
        checksum: "pending",
        createdBy: input.actorId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day retention
      });
      recoveryPointId = rp.id;
    } catch {
      // Recovery-point creation failed — abort with zero writes (FR-018).
      throw new ServiceUnavailableException({
        code: "operation-capacity-unavailable",
        title: "Could not create recovery point; apply aborted",
        status: 503,
      });
    }

    // --- 6. transition change set to applying + enqueue the Worker apply job ---
    await this.changeSets.updateStatus(cs.id, "applying", cs.version);

    const deduplicationId = `apply-${cs.id.slice(0, 8)}`.slice(0, 50);
    // 009 T018: source-scoped lease so concurrent manual + scheduled triggers
    // for the same source dedup at the lease layer.
    const leaseScope = cs.sourceId ? leaseScopeFor(cs.sourceId) : undefined;
    const enqueued = await this.queue.enqueue(
      this.taskTypeFor(cs.kind),
      {
        changeSetId: cs.id,
        recoveryPointId,
        kind: cs.kind,
        scopeType: cs.scopeType,
        scopeId: cs.scopeId,
        sourceId: cs.sourceId,
        sourceType: "operation",
        confirmedWarningCodes: [...input.confirmedWarningCodes],
        operatorReason: input.operatorReason,
        requestId: input.requestId,
        // 009: thread snapshotId + sourceVersion so the Worker apply path can
        // run the new atomic apply with the originally-prepared snapshot.
        snapshotId: cs.snapshotId ?? null,
        sourceVersion: cs.sourceVersion ?? null,
      },
      {
        jobName: "operation-apply",
        requestId: input.requestId ?? undefined,
        changeSetId: cs.id,
        deduplicationId,
        scopeType: cs.scopeType,
        scopeId: cs.scopeId,
        inputFingerprint: cs.inputFingerprint,
        leaseScope,
      },
    );

    const applyTaskId = enqueued.taskId;

    // Cache the response for idempotency replay.
    if (input.idempotencyKey) {
      await this.idempotency.saveResponse(input.actorId, "operation-apply", input.idempotencyKey, 202, {
        taskId: applyTaskId,
        changeSetId: cs.id,
        recoveryPointId,
      });
    }

    return {
      taskId: applyTaskId,
      changeSetId: cs.id,
      recoveryPointId,
      statusUrl: `/tasks/${applyTaskId}`,
      deduplicated: false,
    };
  }

  private taskTypeFor(kind: string): "m3u-sync" | "epg-match" | "source-check" {
    switch (kind) {
      case "m3u_sync": return "m3u-sync";
      case "epg_match": return "epg-match";
      case "source_delete": return "source-check";
      default: return "m3u-sync";
    }
  }
}
