import type {
  ISourceSyncRepository,
  SourceDeleteImpact,
  SourceDeleteResult,
} from "@/domain/source-sync";

/** Thin application boundary for source-delete preview/apply routing. */
export class PrepareSourceDeleteUseCase {
  constructor(private readonly repo: ISourceSyncRepository) {}

  execute(sourceId: string): Promise<SourceDeleteImpact> {
    return this.repo.prepareSourceDelete(sourceId);
  }
}

export class ApplySourceDeleteUseCase {
  constructor(private readonly repo: ISourceSyncRepository) {}

  execute(
    sourceId: string,
    recovery?: { recoveryPointId: string; changeSetId: string },
    expectedSourceVersion?: number,
  ): Promise<SourceDeleteResult> {
    if (recovery || expectedSourceVersion !== undefined) {
      return this.repo.applySourceDelete(
        sourceId,
        recovery,
        expectedSourceVersion,
      );
    }
    return this.repo.applySourceDelete(sourceId);
  }
}
