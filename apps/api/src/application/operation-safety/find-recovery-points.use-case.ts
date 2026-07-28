/**
 * FindRecoveryPointsUseCase (T099).
 *
 * Lists recovery points with metadata + capability. Snapshot payload is never
 * returned in list/detail (contracts/backups.md).
 */
import type { IRecoveryPointRepository } from "@/domain/operation-safety";

export class FindRecoveryPointsUseCase {
  constructor(private readonly recoveryRepo: IRecoveryPointRepository) {}

  async findByChangeSet(changeSetId: string) {
    return this.recoveryRepo.findByChangeSet(changeSetId);
  }

  async findById(id: string) {
    return this.recoveryRepo.findById(id);
  }
}
