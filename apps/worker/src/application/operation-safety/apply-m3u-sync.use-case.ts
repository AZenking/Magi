/**
 * ApplyM3uSyncUseCase (T037; 009-m3u-control-plane T017 rewrites the per-row
 * upsert+markMissing loop into a single atomic applyAtomic call that owns
 * stable upsert + missing marking + source status + recovery items in one
 * transaction, plus restores previously-missing channels that reappear).
 *
 * Worker-side apply of an approved M3U change set. Re-loads the staged
 * snapshot, diffs against the current present baseline to compute the real
 * present/missing source-channel ID lists, then delegates to applyAtomic for
 * the actual write. Reappearing lines are restored in the same call so their
 * identity + health history is preserved (FR-017).
 *
 * Side effects: source channels upserted/marked-missing, source sync status
 * bumped, source-derived streams hidden for newly-missing channels. The
 * Worker job-runner wraps this in lease + recovery semantics.
 *
 * Depends only on domain ports (constitution III).
 */
import type {
  ISourceSyncRepository,
  ParsedSourceChannel,
} from "@/domain/source-sync";

export interface ApplyM3uSyncInput {
  readonly sourceId: string;
  readonly snapshotId: string;
  /** 009: required to bind the apply to the prepared change set. */
  readonly changeSetId?: string;
  /** 009: required to reject stale snapshots after source config edit. */
  readonly sourceVersion?: number;
  readonly contentFingerprint?: string;
  /** Recovery point created by the API before the Worker mutates state. */
  readonly recoveryPointId?: string;
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ApplyM3uSyncResult {
  /** Pre-009 shape — preserved for callers that don't pass changeSetId. */
  readonly upsertedCount: number;
  readonly createdCount: number;
  readonly missingMarkedCount: number;
  /** 009: atomic-apply outcomes. Present when changeSetId is supplied. */
  readonly applied?: boolean;
  readonly sourcesActivated?: number;
  readonly sourcesDeactivated?: number;
  readonly streamsMissing?: number;
  readonly streamsRestored?: number;
}

export class ApplyM3uSyncUseCase {
  constructor(
    private readonly repo: ISourceSyncRepository,
    private readonly loadSnapshotItems: (snapshotId: string) => Promise<
      ReadonlyArray<{
        channelIdentity: string;
        collisionOrdinal?: number;
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

    // A duplicate stable identity is a collision, not two updates to the same
    // source row. It must remain a review blocker; silently applying the last
    // duplicate would lose one of the upstream lines and its retention history.
    const identityCounts = new Map<string, number>();
    for (const item of items) {
      identityCounts.set(
        item.channelIdentity,
        (identityCounts.get(item.channelIdentity) ?? 0) + 1,
      );
    }
    if ([...identityCounts.values()].some((count) => count > 1)) {
      throw new Error("Snapshot contains duplicate channel identities");
    }

    // Load the current present + missing channels so we can compute real
    // present/missing source-channel IDs (009 T017).
    await input.updateProgress?.(25, "load-baseline");
    const [presentBaseline, currentChannels] = await Promise.all([
      this.repo.loadPresentChannels(sourceId),
      this.repo.loadCurrentChannels(sourceId),
    ]);

    if (items.length === 0 && !input.changeSetId) {
      // Legacy path: empty snapshot, no change set context — just record success.
      await this.repo.recordSourceSync(sourceId, "success", null);
      return { upsertedCount: 0, createdCount: 0, missingMarkedCount: 0 };
    }

    // 009 atomic path — when changeSetId is supplied, delegate the entire
    // write to applyAtomic so stable upsert, missing marking, source status
    // bump, recovery items and reconcile output all happen in one transaction.
    if (input.changeSetId) {
      return this.executeAtomic(input, items, presentBaseline, currentChannels);
    }

    // Legacy path — preserved for callers that still use the loop form (e.g.
    // the existing operation-worker handler before T019 migrates callers).
    return this.executeLegacyLoop(input, items);
  }

  private async executeAtomic(
    input: ApplyM3uSyncInput,
    items: ReadonlyArray<{
      channelIdentity: string;
      collisionOrdinal?: number;
      payload: {
        displayName: string;
        groupTitle: string | null;
        tvgId: string | null;
        tvgLogo: string | null;
        streamUrl: string | null;
      };
    }>,
    presentBaseline: ReadonlyArray<{ id: string; channelIdentity: string }>,
    currentChannels: ReadonlyArray<{
      id: string;
      channelIdentity: string;
      sourcePresence: string;
    }>,
  ): Promise<ApplyM3uSyncResult> {
    const { sourceId, snapshotId, changeSetId } = input;
    const now = new Date();

    // Build present-channel payload list (snapshot → ParsedSourceChannel).
    const presentChannels: ParsedSourceChannel[] = items.map((item) => ({
      channelIdentity: item.channelIdentity,
      displayName: item.payload.displayName,
      groupTitle: item.payload.groupTitle,
      tvgId: item.payload.tvgId,
      tvgLogo: item.payload.tvgLogo,
      streamUrl: item.payload.streamUrl,
    }));

    // Identity → row id for the present baseline (so we can compute which
    // currently-present IDs are missing from this snapshot).
    const presentIdentities = new Set(items.map((i) => i.channelIdentity));
    const missingSourceChannelIds = presentBaseline
      .filter((c) => !presentIdentities.has(c.channelIdentity))
      .map((c) => c.id);

    // Compute reappearance set: channels currently in 'missing' state whose
    // identity re-appears in this snapshot. The repository restores these
    // inside the same transaction as the apply, so a later failure rolls back
    // both the restoration and the rest of the snapshot.
    const reappearingIds = currentChannels
      .filter(
        (c) =>
          c.sourcePresence === "missing" &&
          presentIdentities.has(c.channelIdentity),
      )
      .map((c) => c.id);

    await input.updateProgress?.(70, "apply-atomic");
    const result = await this.repo.applyAtomic({
      sourceId,
      snapshotId,
      changeSetId: changeSetId!,
      presentChannels,
      missingSourceChannelIds,
      restoreSourceChannelIds: reappearingIds,
      contentFingerprint: input.contentFingerprint ?? "",
      sourceVersion: input.sourceVersion ?? 1,
      now,
      recoveryPointId: input.recoveryPointId,
    });

    await input.updateProgress?.(100, "done");
    return {
      upsertedCount: presentChannels.length,
      createdCount: result.sourcesActivated,
      missingMarkedCount: result.sourcesDeactivated,
      applied: true,
      sourcesActivated: result.sourcesActivated,
      sourcesDeactivated: result.sourcesDeactivated,
      streamsMissing: result.streamsMissing,
      streamsRestored: result.streamsRestored,
    };
  }

  private async executeLegacyLoop(
    input: ApplyM3uSyncInput,
    items: ReadonlyArray<{
      channelIdentity: string;
      collisionOrdinal?: number;
      payload: {
        displayName: string;
        groupTitle: string | null;
        tvgId: string | null;
        tvgLogo: string | null;
        streamUrl: string | null;
      };
    }>,
  ): Promise<ApplyM3uSyncResult> {
    const { sourceId } = input;

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
