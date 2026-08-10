/**
 * Worker source-sync repository ports (T037/T039, extended by 009-m3u-control-plane T008).
 *
 * Abstractions over the data access the Worker needs to stage snapshots and
 * apply stable diffs. Implementations live in `infrastructure/` (Drizzle).
 * The Worker application depends on these ports only (constitution III).
 *
 * These methods intentionally mirror a focused slice of the API repository
 * surface — only what the Worker needs for preview/apply, without exposing
 * operator-field mutations (FR-004: manual fields are preserved, not written
 * by these ports).
 */

/** A source row needed to download + parse. */
export interface SourceSnapshotInput {
  readonly id: string;
  readonly url: string;
  readonly headers: Record<string, string> | null;
  readonly enabled: boolean;
  readonly freshnessThresholdMinutes: number;
  readonly version: number;
}

/** A parsed source channel ready to stage. */
export interface ParsedSourceChannel {
  readonly channelIdentity: string;
  readonly displayName: string;
  readonly groupTitle: string | null;
  readonly tvgId: string | null;
  readonly tvgLogo: string | null;
  readonly streamUrl: string | null;
}

/** Current operator-visible state of a source channel (for diffing). */
export interface CurrentSourceChannel {
  readonly id: string;
  readonly channelIdentity: string;
  readonly displayName: string;
  readonly groupTitle: string | null;
  readonly streamUrl: string | null;
  readonly sourcePresence: string;
  readonly version: number;
  /** Upstream tvg-id; needed by reconcile auto-merge (009 T025). */
  readonly tvgId: string | null;
}

/** Snapshot-stage result with reuse hint (009: idempotent prepare). */
export interface StageSnapshotResult {
  readonly snapshotId: string;
  readonly itemCount: number;
  /** True when an unexpired snapshot with the same fingerprint was reused. */
  readonly reused: boolean;
}

/** Reconcile input populated by the apply use case (009: real present/missing IDs). */
export interface ReconcileApplyInput {
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly presentSourceChannelIds: readonly string[];
  readonly missingSourceChannelIds: readonly string[];
  readonly recoveryChangeSetId: string;
}

/** Reconcile output consumed by composition / publication projection. */
export interface ReconcileApplyResult {
  readonly sourcesActivated: number;
  readonly sourcesDeactivated: number;
  readonly streamsMissing: number;
  readonly streamsRestored: number;
}

/**
 * Source deletion impact. Counts are deliberately source-scoped so the
 * preview never reports global canonical/stream totals as if they belonged to
 * the selected source.
 */
export interface SourceDeleteCounts {
  readonly rawChannels: number;
  readonly channels: number;
  readonly programmes: number;
  readonly epgMappings: number;
  readonly canonicalMemberships: number;
  readonly streams: number;
  readonly schedules: number;
}

export interface SourceDeleteImpact {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: "m3u" | "xmltv";
  /** Source row version captured for delete-preview optimistic concurrency. */
  readonly sourceVersion?: number;
  readonly counts: SourceDeleteCounts;
}

export interface SourceDeleteResult extends SourceDeleteImpact {
  readonly deleted: boolean;
}

export interface ISourceSyncRepository {
  /** Load a source for download. Returns null if missing/disabled. */
  loadSource(sourceId: string): Promise<SourceSnapshotInput | null>;

  /** Persist an immutable snapshot + its items; return the snapshot id. */
  stageSnapshot(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<{ snapshotId: string; itemCount: number }>;

  /**
   * Stage a snapshot idempotently (009 T016).
   *
   * If an unexpired snapshot already exists for (sourceId, fingerprint), return
   * its id without re-inserting items. Otherwise insert and return `reused=false`.
   */
  stageSnapshotIdempotent(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<StageSnapshotResult>;

  /** Load current source channels for diffing. */
  loadCurrentChannels(sourceId: string): Promise<CurrentSourceChannel[]>;

  /**
   * Load source channels filtered by presence — used by the apply path to
   * compute the current baseline (009 T017).
   */
  loadPresentChannels(sourceId: string): Promise<CurrentSourceChannel[]>;

  /** Stable upsert a source channel (preserve id/operator/health). Returns the row. */
  stableUpsert(
    sourceId: string,
    channel: ParsedSourceChannel,
  ): Promise<{ id: string; created: boolean }>;

  /** Mark absent identities as missing (no delete). Returns affected count. */
  markMissing(
    sourceId: string,
    presentIdentities: readonly string[],
    now: Date,
  ): Promise<number>;

  /**
   * Atomically apply a prepared change set in one transaction (009 T017):
   *   - stable upsert present channels
   *   - mark missing channels + set missingSince
   *   - record source status + fingerprint bump
   *   - capture recovery items
   *   - emit reconcile input with REAL present/missing IDs
   *
   * Returns the IDs the reconcile use case needs to update canonical membership
   * and source-stream visibility.
   */
  applyAtomic(input: {
    readonly sourceId: string;
    readonly snapshotId: string;
    readonly changeSetId: string;
    readonly presentChannels: readonly ParsedSourceChannel[];
    readonly missingSourceChannelIds: readonly string[];
    /** Channels that reappeared during this snapshot; restored in the same transaction. */
    readonly restoreSourceChannelIds?: readonly string[];
    readonly contentFingerprint: string;
    readonly sourceVersion: number;
    readonly now: Date;
    /** API-originated applies provide the pre-created recovery point. */
    readonly recoveryPointId?: string;
  }): Promise<ReconcileApplyResult>;

  /** Update source sync status (lastSyncAt/lastSyncStatus/fingerprint). */
  recordSourceSync(
    sourceId: string,
    status: "success" | "failed",
    contentFingerprint: string | null,
  ): Promise<void>;

  /**
   * Restore a source's missing channels to present (009 T017 reappearance).
   * Resets `sourcePresence` to `present` and clears `missingSince` for the
   * supplied IDs. Returns the count of rows actually restored.
   */
  restoreMissing(
    sourceId: string,
    sourceChannelIds: readonly string[],
    now: Date,
  ): Promise<number>;

  /**
   * Purge source channels whose missing-since is older than the retention
   * window (009 T028, 30 days). Only auto-source relationships are cleaned;
   * manual streams and channels with active members are preserved.
   */
  purgeExpiredMissing(
    sourceId: string | null,
    retentionSeconds: number,
    now: Date,
  ): Promise<{
    readonly purgedSourceChannels: number;
    readonly purgedStreams: number;
  }>;

  /**
   * Prepare a source-scoped deletion preview. Disabled sources are valid
   * deletion targets; only a missing source is rejected.
   */
  prepareSourceDelete(sourceId: string): Promise<SourceDeleteImpact>;

  /** Apply the approved source deletion in one database transaction. */
  applySourceDelete(
    sourceId: string,
    recovery?: { recoveryPointId: string; changeSetId: string },
    expectedSourceVersion?: number,
  ): Promise<SourceDeleteResult>;
}
