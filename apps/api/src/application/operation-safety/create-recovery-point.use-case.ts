/**
 * CreateRecoveryPointUseCase (T040).
 *
 * Captures per-object pre-operation state into a recovery point. Called by
 * ApplyOperationUseCase before any business mutation. If creation fails, the
 * apply must not proceed (FR-018 — zero writes on failure).
 */
import type { IRecoveryPointRepository } from "@/domain/operation-safety";
import type { OperationKind, OperationScopeType } from "@magi/types";

export interface CreateRecoveryPointInput {
  readonly operationKind: OperationKind;
  readonly scopeType: OperationScopeType;
  readonly scopeId: string;
  readonly changeSetId: string;
  readonly taskId: string;
  readonly createdBy: string;
  /** Snapshot of affected objects (id + version + redacted payload). */
  readonly items: ReadonlyArray<{
    entityType: string;
    entityId: string;
    entityVersion: number;
    payload: Record<string, unknown>;
  }>;
}

export interface CreateRecoveryPointResult {
  readonly recoveryPointId: string;
  readonly itemCount: number;
}

export class CreateRecoveryPointUseCase {
  constructor(private readonly recoveryPoints: IRecoveryPointRepository) {}

  async execute(input: CreateRecoveryPointInput): Promise<CreateRecoveryPointResult> {
    const checksumSource = input.items
      .map((i) => `${i.entityType}:${i.entityId}:${i.entityVersion}`)
      .sort()
      .join("|");
    // Simple checksum (full SHA would be in infra; this is the use-case layer).
    const checksum = `rp:${checksumSource.length}:${input.items.length}`;

    // Create the recovery point. On failure, the caller aborts (FR-018).
    const rp = await this.recoveryPoints.create({
      status: "creating",
      operationKind: input.operationKind,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      changeSetId: input.changeSetId,
      taskId: input.taskId,
      schemaVersion: 1,
      itemCount: input.items.length,
      checksum,
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Persist the per-object items (infra writes them in order).
    await this.recoveryPoints.createItems(
      input.items.map((item, index) => ({
        recoveryPointId: rp.id,
        entityType: item.entityType,
        entityId: item.entityId,
        entityVersion: item.entityVersion,
        payload: item.payload,
        itemOrder: index,
        checksum: `${item.entityType}:${item.entityId}`,
      })),
    );

    // Transition to ready once items are persisted.
    await this.recoveryPoints.updateStatus(rp.id, "ready");
    return { recoveryPointId: rp.id, itemCount: input.items.length };
  }
}
