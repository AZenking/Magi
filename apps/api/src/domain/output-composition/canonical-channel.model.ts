export type EpgStatus = "matched_manual" | "matched_auto" | "unmatched" | "conflict" | null;
export type OutputStatus = "active" | "degraded" | "unavailable";
export type MergeMethod = "manual" | "tvg_id" | "exact_name" | "similar_name" | null;

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
}

export class CanonicalChannelModel {
  constructor(private readonly channel: CanonicalChannel) {}

  shouldBeInOutput(): boolean {
    return !this.channel.hidden && !this.channel.disabled;
  }

  hasEpg(): boolean {
    return !!this.channel.epgChannelId && (this.channel.epgStatus?.startsWith("matched") ?? false);
  }

  isHealthy(): boolean {
    return this.channel.outputStatus === "active";
  }

  toObject(): CanonicalChannel {
    return { ...this.channel };
  }
}
