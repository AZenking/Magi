/**
 * Worker source-sync repository ports (T037/T039).
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
  readonly sourcePresence: string;
  readonly version: number;
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

  /** Load current source channels for diffing. */
  loadCurrentChannels(sourceId: string): Promise<CurrentSourceChannel[]>;

  /** Stable upsert a source channel (preserve id/operator/health). Returns the row. */
  stableUpsert(sourceId: string, channel: ParsedSourceChannel): Promise<{ id: string; created: boolean }>;

  /** Mark absent identities as missing (no delete). Returns affected count. */
  markMissing(sourceId: string, presentIdentities: readonly string[], now: Date): Promise<number>;

  /** Update source sync status (lastSyncAt/lastSyncStatus/fingerprint). */
  recordSourceSync(
    sourceId: string,
    status: "success" | "failed",
    contentFingerprint: string | null,
  ): Promise<void>;
}
