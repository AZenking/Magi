/**
 * ReconcileCanonicalChannelsUseCase (T038).
 *
 * Incremental reconciliation linking source channels to canonical channels via
 * stable membership. Preserves override, lifecycle, manual streams, primary
 * stream and health history — never deletes or regenerates canonical IDs
 * (research §3, FR-004).
 *
 * Depends only on domain ports (constitution III).
 */
import type { ICanonicalReconcileRepository } from "@/domain/source-sync/canonical-reconcile.repository";

export interface ReconcileInput {
  readonly sourceId: string;
  readonly sourceChannelIds: readonly string[];
  readonly missingSourceChannelIds: readonly string[];
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ReconcileResult {
  readonly linkedCount: number;
  readonly createdCount: number;
  readonly deactivatedCount: number;
}

export class ReconcileCanonicalChannelsUseCase {
  constructor(private readonly repo: ICanonicalReconcileRepository) {}

  async execute(input: ReconcileInput): Promise<ReconcileResult> {
    const { sourceChannelIds, missingSourceChannelIds } = input;
    let linkedCount = 0;
    let createdCount = 0;

    // Link each present source channel to its canonical (create if none).
    let i = 0;
    for (const sourceChannelId of sourceChannelIds) {
      const existing = await this.repo.findMembership(sourceChannelId);
      if (existing) {
        linkedCount++;
      } else {
        const { canonicalChannelId } = await this.repo.createCanonicalFromSource(
          sourceChannelId,
          sourceChannelId,
        );
        await this.repo.upsertMembership(canonicalChannelId, {
          sourceChannelId,
          channelIdentity: sourceChannelId,
        });
        createdCount++;
      }
      if (input.updateProgress && i % 100 === 0) {
        await input.updateProgress(Math.floor((i / sourceChannelIds.length) * 80), "reconcile");
      }
      i++;
    }

    // Deactivate memberships for source channels that went missing (FR-014).
    let deactivatedCount = 0;
    for (const missingId of missingSourceChannelIds) {
      const membership = await this.repo.findMembership(missingId);
      if (membership) {
        await this.repo.deactivateMembership(membership.canonicalChannelId, missingId);
        deactivatedCount++;
      }
    }

    await input.updateProgress?.(100, "done");
    return { linkedCount, createdCount, deactivatedCount };
  }
}
