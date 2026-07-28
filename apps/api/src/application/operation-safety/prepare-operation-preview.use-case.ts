/**
 * PrepareOperationPreviewUseCase (T036).
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

    // 2. Create a task row (pending) for traceability.
    const task = await this.tasks.create({
      sourceType: "operation",
      taskType: this.taskTypeFor(input.kind),
      sourceId: input.sourceId,
      status: "pending",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      progress: 0,
      currentStep: "queued",
      executionLog: null,
      importedCount: 0,
      addedCount: 0,
      updatedCount: 0,
      removedCount: 0,
      queueName: "operation",
      jobId: null,
      jobName: null,
      attemptsMade: 0,
      processedOn: null,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      targetType: input.scopeType,
      targetId: input.scopeId,
      targetDisplayName: input.scopeId,
      initiatorType: "user",
      initiatorId: input.requestedBy,
      parentTaskId: null,
      rootTaskId: null,
      requestId: input.requestId,
      changeSetId,
      inputFingerprint: input.inputFingerprint,
      stage: "pending",
      resultSummary: null,
      cancelledAt: null,
      cancelRequestedAt: null,
    });

    // 3. Link the task back to the change set.
    await this.changeSets.updateStatus(changeSetId, "preparing", 1);

    // 4. Enqueue the Worker prepare job with full trace context (T042 enriches).
    const deduplicationId = `prepare:${input.scopeType}:${input.scopeId}:${input.inputFingerprint}`;
    const enqueued = await this.queue.enqueue(
      "cleanup", // taskType for routing; the payload's `kind` carries the real operation
      {
        taskId: task.id,
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
      },
    );

    // Link the enqueued job id back to the task (best-effort).
    await this.tasks.updateSafeOps(task.id, { jobId: enqueued.jobId }).catch(() => undefined);

    return {
      changeSetId,
      taskId: task.id,
      statusUrl: `/tasks/${task.id}`,
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
