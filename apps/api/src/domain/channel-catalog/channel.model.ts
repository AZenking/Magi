export type EpgMatchType = "tvg-id" | "tvg-name" | "display-name" | "manual" | "auto" | "fuzzy" | "conflict" | null;
export type StreamStatus = "online" | "offline" | "degraded" | "unknown";

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

  toObject(): Channel {
    return { ...this.channel };
  }
}
