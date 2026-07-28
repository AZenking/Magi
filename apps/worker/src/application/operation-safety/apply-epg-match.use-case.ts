/**
 * ApplyEpgMatchUseCase (T039).
 *
 * Applies only the approved (selected) EPG bindings from a change set. Manual
 * locks are never overwritten; canonical IDs are never regenerated; manual
 * streams and health history are untouched (FR-004/FR-006, research §4).
 */
import type { IEpgSyncRepository } from "@/domain/source-sync/epg-sync.repository";

export interface ApprovedBinding {
  readonly canonicalChannelId: string;
  readonly xmltvSourceId: string;
  readonly epgChannelId: string;
  readonly matchType: string;
  readonly expectedVersion: number;
}

export interface ApplyEpgMatchInput {
  readonly approvedBindings: readonly ApprovedBinding[];
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ApplyEpgMatchResult {
  readonly appliedCount: number;
  readonly skippedLockedCount: number;
}

export class ApplyEpgMatchUseCase {
  constructor(private readonly repo: IEpgSyncRepository) {}

  async execute(input: ApplyEpgMatchInput): Promise<ApplyEpgMatchResult> {
    let appliedCount = 0;
    let skippedLockedCount = 0;

    // Re-check each target: a manual lock may have been set since preview.
    const canonicals = await this.repo.loadCanonicalChannelsForEpg();
    const lockedIds = new Set(
      canonicals.filter((c) => c.manualEpgLocked).map((c) => c.id),
    );

    let i = 0;
    for (const binding of input.approvedBindings) {
      if (lockedIds.has(binding.canonicalChannelId)) {
        skippedLockedCount++;
        i++;
        continue;
      }
      const ok = await this.repo.applyEpgBinding(
        binding.canonicalChannelId,
        binding.xmltvSourceId,
        binding.epgChannelId,
        binding.matchType,
        binding.expectedVersion,
      );
      if (ok) appliedCount++;
      if (input.updateProgress && i % 50 === 0) {
        await input.updateProgress(
          Math.floor((i / input.approvedBindings.length) * 100),
          "apply",
        );
      }
      i++;
    }

    return { appliedCount, skippedLockedCount };
  }
}
