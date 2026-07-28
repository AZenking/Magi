export type EpgMatchType = "tvg-id" | "tvg-name" | "display-name" | "manual" | "auto" | "fuzzy" | "conflict" | null;
export type StreamStatus = "online" | "offline" | "degraded" | "unknown";
/** Whether a source channel currently appears in upstream input (T017). */
export type SourcePresence = "present" | "missing" | "conflict";

export interface Channel {
  id: string;
  channelIdentity: string;
  m3uSourceId: string | null;
  rawChannelId: string | null;
  displayName: string;
  groupTitle: string | null;
  tvgId: string | null;
  tvgLogo: string | null;
  streamUrl: string | null;
  epgChannelId: string | null;
  epgMatchType: EpgMatchType;
  active: boolean;
  streamStatus: StreamStatus | null;
  streamResponseTime: number | null;
  streamCheckedAt: Date | null;
  streamError: string | null;
  createdAt: Date;
  updatedAt: Date;
  // --- Safe Operations expand fields (T022). Optional so existing
  // implementations/tests that don't populate them keep type-checking. ---
  sourcePresence?: SourcePresence;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  missingSince?: Date | null;
  sourceRevision?: string | null;
  version?: number;
}

export class ChannelModel {
  constructor(private readonly channel: Channel) {}

  canBeDeleted(): boolean {
    return !this.channel.active;
  }

  isActive(): boolean {
    return this.channel.active;
  }

  hasEpgBinding(): boolean {
    return !!this.channel.epgChannelId;
  }

  hasStream(): boolean {
    return !!this.channel.streamUrl;
  }

  /** Stable identity for cross-sync upsert (FR-003). */
  stableIdentity(): string {
    return this.channel.channelIdentity;
  }

  /** Whether upstream input still reports this identity (FR-014). */
  isMissingFromSource(): boolean {
    return this.channel.sourcePresence === "missing";
  }

  toObject(): Channel {
    return { ...this.channel };
  }
}
