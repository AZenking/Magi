/**
 * PrepareOperationPreviewUseCase (T036; 009-m3u-control-plane T018 adds
 * source-scoped leaseScope on enqueue for m3u_sync kind, plus sourceVersion
 * capture on the change set row).
 *
 * Creates a side-effect-free `preparing` change set and enqueues a Worker job
 * to compute the diff. Returns the change-set reference + TaskRef. The current
 * output is NOT mutated (research §1, contracts/operation-previews.md).
 *
 * The actual diff computation lives in the Worker (T037/T039); this use case
 * only persists the preview intent + dispatches the job.
 */
import { randomUUID } from "node:crypto";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { ITaskRepository } from "@/domain/task-execution";
import type { TaskQueuePort } from "@/domain/task-execution/task-queue.port";
import type { OperationKind, OperationScopeType } from "@magi/types";
import { leaseScopeFor } from "@/application/operation-safety/m3u-control-plane-jobs";

export interface PreparePreviewInput {
  readonly kind: OperationKind;
  readonly scopeType: OperationScopeType;
  readonly scopeId: string;
  readonly sourceId: string | null;
  readonly inputFingerprint: string;
  readonly baseVersions: Record<string, number>;
  readonly requestedBy: string;
  readonly requestId: string | null;
}

export interface PreparePreviewResult {
  readonly changeSetId: string;
  readonly taskId: string;
  readonly statusUrl: string;
}

export class PrepareOperationPreviewUseCase {
  constructor(
    private readonly changeSets: IOperationChangeSetRepository,
    private readonly tasks: ITaskRepository,
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(input: PreparePreviewInput): Promise<PreparePreviewResult> {
    const changeSetId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h retention

    // 1. Persist the change set in `preparing`. No business mutation yet.
    await this.changeSets.create({
      id: changeSetId,
      kind: input.kind,
      status: "preparing",
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      sourceId: input.sourceId,
      inputFingerprint: input.inputFingerprint,
      expiresAt,
      requestedBy: input.requestedBy,
      prepareTaskId: null,
      applyTaskId: null,
    });

    // 2. Link the change set to preparing status.
    await this.changeSets.updateStatus(changeSetId, "preparing", 1);

    // 3. Enqueue the Worker prepare job — this creates the task row inside enqueue.
    //    Use changeSetId in the deduplicationId so repeated requests for the same
    //    source don't get silently deduped by BullMQ.
    const deduplicationId = `prep-${changeSetId.slice(0, 8)}`.slice(0, 50);
    // 009 T018: for m3u_sync, acquire the source-scoped lease so manual and
    // scheduled triggers dedup at the lease layer (FR-004). Other operation
    // kinds don't have a natural sourceId and skip this.
    const leaseScope =
      (input.kind === "m3u_sync" || input.kind === "source_delete") && input.sourceId
        ? leaseScopeFor(input.sourceId)
        : undefined;
    const enqueued = await this.queue.enqueue(
      this.taskTypeFor(input.kind),
      {
        changeSetId,
        kind: input.kind,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        sourceId: input.sourceId,
        sourceType: "operation",
        inputFingerprint: input.inputFingerprint,
        baseVersions: input.baseVersions,
        requestId: input.requestId,
      },
      {
        jobName: "operation-prepare",
        requestId: input.requestId ?? undefined,
        changeSetId,
        deduplicationId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        inputFingerprint: input.inputFingerprint,
        leaseScope,
      },
    );

    const taskId = enqueued.taskId;

    return {
      changeSetId,
      taskId,
      statusUrl: `/tasks/${taskId}`,
    };
  }

  private taskTypeFor(kind: OperationKind): "m3u-sync" | "xmltv-sync" | "epg-match" | "source-check" | "stream-check" | "import-epg" | "refresh-epg" | "cleanup" {
    // Operation preview tasks are mapped to the closest existing TaskType so
    // the task table's type constraint is satisfied. The `kind` is preserved on
    // the change set + queue job name for precise routing.
    switch (kind) {
      case "m3u_sync":
        return "m3u-sync";
      case "epg_match":
        return "epg-match";
      case "source_delete":
        return "source-check";
      default:
        return "cleanup";
    }
  }
}
