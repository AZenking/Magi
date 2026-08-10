/**
 * CancelOperationPreviewUseCase (T036).
 *
 * Cancels a preview in `preparing` or `ready` state. Allowed only before apply
 * has started; requests task cancellation when supported (contracts/
 * operation-previews.md POST .../cancel). Uses If-Match.
 */
import { ConflictException } from "@nestjs/common";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { ITaskRepository } from "@/domain/task-execution";
import type { TaskQueuePort } from "@/domain/task-execution/task-queue.port";

export interface CancelPreviewInput {
  readonly changeSetId: string;
  readonly expectedVersion: number;
}

export class CancelOperationPreviewUseCase {
  constructor(
    private readonly changeSets: IOperationChangeSetRepository,
    private readonly tasks: ITaskRepository,
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(input: CancelPreviewInput): Promise<{ status: string }> {
    const cs = await this.changeSets.findById(input.changeSetId);
    if (!cs)
      throw new ConflictException({ code: "resource-not-found", status: 404 });
    if (cs.version !== input.expectedVersion) {
      throw new ConflictException({
        code: "stale-resource",
        status: 412,
        currentVersion: cs.version,
      });
    }
    // Only preparing/ready can be cancelled.
    if (cs.status !== "preparing" && cs.status !== "ready") {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `Cannot cancel a change set in status ${cs.status}`,
        status: 409,
      });
    }

    const updated = await this.changeSets.updateStatus(
      input.changeSetId,
      "cancelled",
      cs.version,
    );
    if (!updated) {
      throw new ConflictException({
        code: "stale-resource",
        status: 412,
        currentVersion: cs.version,
      });
    }
    // Best-effort task cancellation (prepare job may still be running).
    if (cs.prepareTaskId) {
      await this.queue.cancel(cs.prepareTaskId).catch(() => false);
      await this.tasks.updateSafeOps(cs.prepareTaskId, {
        cancelRequestedAt: new Date(),
      });
    }
    return { status: updated.status };
  }
}
