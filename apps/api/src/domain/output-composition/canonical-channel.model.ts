export type EpgStatus = "matched_manual" | "matched_auto" | "unmatched" | "conflict" | null;
export type OutputStatus = "active" | "degraded" | "unavailable";
export type MergeMethod = "manual" | "tvg_id" | "exact_name" | "similar_name" | "merge_key" | null;
/** Single source of lifecycle truth (T017/data-model.md). */
export type ChannelLifecycle = "active" | "hidden" | "disabled" | "trashed";

export interface CanonicalChannel {
  id: string;
  standardName: string;
  standardGroup: string | null;
  standardLogo: string | null;
  channelNumber: number | null;
  hidden: boolean;
  starred: boolean;
  disabled: boolean;
  epgChannelId: string | null;
  epgMatchType: string | null;
  epgStatus: EpgStatus;
  outputStatus: OutputStatus;
  qualityScore: number | null;
  primaryStreamId: string | null;
  mergedFromIds: string | null;
  mergeMethod: MergeMethod;
  conflictNote: string | null;
  lastMergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // --- Safe Operations expand fields (T022). Optional during transition;
  // compatibility booleans (hidden/disabled) remain readable. ---
  lifecycle?: ChannelLifecycle;
  lifecycleReason?: string | null;
  trashedAt?: Date | null;
  purgeAfter?: Date | null;
  stableKey?: string | null;
  version?: number;
}

export class CanonicalChannelModel {
  constructor(private readonly channel: CanonicalChannel) {}

  /** Lifecycle-aware output eligibility. Falls back to booleans if lifecycle unset. */
  shouldBeInOutput(): boolean {
    if (this.channel.lifecycle) return this.channel.lifecycle === "active";
    return !this.channel.hidden && !this.channel.disabled;
  }

  /** Current lifecycle, deriving from booleans if the new column is unset. */
  lifecycleState(): ChannelLifecycle {
    if (this.channel.lifecycle) return this.channel.lifecycle;
    if (this.channel.disabled) return "disabled";
    if (this.channel.hidden) return "hidden";
    return "active";
  }

  hasEpg(): boolean {
    return !!this.channel.epgChannelId && (this.channel.epgStatus?.startsWith("matched") ?? false);
  }

  isHealthy(): boolean {
    return this.channel.outputStatus === "active";
  }

  /** Purge allowed only after purgeAfter (FR-016). */
  canPurge(now: Date = new Date()): boolean {
    return (
      this.lifecycleState() === "trashed" &&
      this.channel.purgeAfter != null &&
      this.channel.purgeAfter.getTime() <= now.getTime()
    );
  }

  /** Whether this channel may transition to `target` (contracts/channels.md). */
  canTransitionTo(target: ChannelLifecycle): boolean {
    // Inline the allowed-transition check to avoid importing the types runtime
    // (this model is framework-agnostic). Mirrors canTransition in @magi/types.
    const from = this.lifecycleState();
    if (from === target) return false;
    const allowed: Record<ChannelLifecycle, readonly ChannelLifecycle[]> = {
      active: ["hidden", "disabled", "trashed"],
      hidden: ["active", "disabled", "trashed"],
      disabled: ["active", "hidden", "trashed"],
      trashed: ["active", "hidden", "disabled"],
    };
    return allowed[from].includes(target);
  }

  toObject(): CanonicalChannel {
    return { ...this.channel };
  }
}
