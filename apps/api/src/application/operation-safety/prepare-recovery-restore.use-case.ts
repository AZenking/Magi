/**
 * PrepareRecoveryRestoreUseCase (T040).
 *
 * Reads a recovery point + its items and produces a restore preview (which
 * objects will be restored). The actual restore apply runs in the Worker
 * (apply-recovery-restore.use-case.ts). Restore is itself a change set.
 */
import { ConflictException } from "@nestjs/common";
import type { IRecoveryPointRepository } from "@/domain/operation-safety";

export interface PrepareRecoveryRestoreInput {
  readonly recoveryPointId: string;
}

export interface RestorePreview {
  readonly recoveryPointId: string;
  readonly status: string;
  readonly itemCount: number;
  readonly items: ReadonlyArray<{
    entityType: string;
    entityId: string;
    entityVersion: number;
  }>;
  readonly canRestore: boolean;
}

export class PrepareRecoveryRestoreUseCase {
  constructor(private readonly recoveryPoints: IRecoveryPointRepository) {}

  async execute(input: PrepareRecoveryRestoreInput): Promise<RestorePreview> {
    const rp = await this.recoveryPoints.findById(input.recoveryPointId);
    if (!rp) throw new ConflictException({ code: "resource-not-found", status: 404 });
    if (rp.status !== "ready") {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `Recovery point is ${rp.status}, not ready`,
        status: 409,
      });
    }
    if (rp.expiresAt && rp.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({ code: "preview-expired", status: 410 });
    }

    const items = await this.recoveryPoints.findItems(input.recoveryPointId);
    return {
      recoveryPointId: rp.id,
      status: rp.status,
      itemCount: items.length,
      canRestore: true,
      items: items.map((i: { entityType: string; entityId: string | null; entityVersion: number | null }) => ({
        entityType: i.entityType,
        entityId: i.entityId ?? "",
        entityVersion: i.entityVersion ?? 0,
      })),
    };
  }
}
