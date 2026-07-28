/**
 * ApplyM3uSyncUseCase (T037).
 *
 * Worker-side apply of an approved M3U change set. Re-loads the staged
 * snapshot, performs stable upsert (preserves id/operator/health — FR-003/004),
 * marks absent identities as missing (no delete — FR-014), and records source
 * sync status. The Worker job-runner wraps this in lease + recovery semantics.
 *
 * Depends only on domain ports (constitution III).
 */
import type { ISourceSyncRepository } from "@/domain/source-sync";

export interface ApplyM3uSyncInput {
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ApplyM3uSyncResult {
  readonly upsertedCount: number;
  readonly createdCount: number;
  readonly missingMarkedCount: number;
}

export class ApplyM3uSyncUseCase {
  constructor(
    private readonly repo: ISourceSyncRepository,
    private readonly loadSnapshotItems: (snapshotId: string) => Promise<
      ReadonlyArray<{
        channelIdentity: string;
        payload: {
          displayName: string;
          groupTitle: string | null;
          tvgId: string | null;
          tvgLogo: string | null;
          streamUrl: string | null;
        };
      }>
    >,
  ) {}

  async execute(input: ApplyM3uSyncInput): Promise<ApplyM3uSyncResult> {
    const { sourceId, snapshotId } = input;

    // Re-load the immutable staged snapshot (never re-download — TOCTOU safety).
    await input.updateProgress?.(10, "load-snapshot");
    const items = await this.loadSnapshotItems(snapshotId);
    if (items.length === 0) {
      await this.repo.recordSourceSync(sourceId, "success", null);
      return { upsertedCount: 0, createdCount: 0, missingMarkedCount: 0 };
    }

    // Stable upsert every identity — preserves id/operator/health (FR-003/004).
    await input.updateProgress?.(40, "upsert");
    let createdCount = 0;
    for (const item of items) {
      const result = await this.repo.stableUpsert(sourceId, {
        channelIdentity: item.channelIdentity,
        displayName: item.payload.displayName,
        groupTitle: item.payload.groupTitle,
        tvgId: item.payload.tvgId,
        tvgLogo: item.payload.tvgLogo,
        streamUrl: item.payload.streamUrl,
      });
      if (result.created) createdCount++;
    }

    // Mark identities absent from the snapshot as missing (no delete — FR-014).
    await input.updateProgress?.(80, "mark-missing");
    const presentIdentities = items.map((i) => i.channelIdentity);
    const missingMarkedCount = await this.repo.markMissing(
      sourceId,
      presentIdentities,
      new Date(),
    );

    await input.updateProgress?.(100, "done");
    await this.repo.recordSourceSync(sourceId, "success", null);

    return {
      upsertedCount: items.length,
      createdCount,
      missingMarkedCount,
    };
  }
}
