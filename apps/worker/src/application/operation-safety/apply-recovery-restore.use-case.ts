/**
 * ApplyRecoveryRestoreUseCase (T040).
 *
 * Worker-side restore: reads the recovery-point items and writes each object's
 * captured state back, in item order (parents before children). Idempotent —
 * replaying a completed restore with the same input produces no additional
 * changes (contracts/backups.md).
 *
 * Depends on a minimal restore port (infra writes the payloads).
 */
export interface RestoreItem {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityVersion: number;
  readonly payload: Record<string, unknown>;
  readonly itemOrder: number;
}

export interface IRestorePort {
  /** Write one captured object back to its table (infra: Drizzle upsert). */
  restoreObject(item: RestoreItem): Promise<void>;
  /** Restore a complete graph in one transaction when the adapter supports it. */
  restoreObjects?(items: readonly RestoreItem[]): Promise<void>;
}

export interface ApplyRecoveryRestoreInput {
  readonly recoveryPointId: string;
  readonly items: readonly RestoreItem[];
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ApplyRecoveryRestoreResult {
  readonly restoredCount: number;
}

export class ApplyRecoveryRestoreUseCase {
  constructor(private readonly restore: IRestorePort) {}

  async execute(
    input: ApplyRecoveryRestoreInput,
  ): Promise<ApplyRecoveryRestoreResult> {
    // Items are already ordered (parents first) by the create use case.
    if (this.restore.restoreObjects) {
      await this.restore.restoreObjects(input.items);
      await input.updateProgress?.(100, "restore");
      return { restoredCount: input.items.length };
    }

    let restoredCount = 0;
    let i = 0;
    for (const item of input.items) {
      await this.restore.restoreObject(item);
      restoredCount++;
      if (input.updateProgress && i % 50 === 0) {
        await input.updateProgress(
          Math.floor((i / input.items.length) * 100),
          "restore",
        );
      }
      i++;
    }
    return { restoredCount };
  }
}
