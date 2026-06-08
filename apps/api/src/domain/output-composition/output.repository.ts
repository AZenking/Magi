import type { CanonicalChannel } from "./canonical-channel.model";
import type { ChannelOverride } from "./channel-override.model";
import type { ChannelStream, StreamWithSource } from "./channel-stream.model";

export interface ICanonicalChannelRepository {
  findAll(params: {
    page: number;
    pageSize: number;
    epgStatus?: string;
    outputStatus?: string;
    hidden?: boolean;
    disabled?: boolean;
    search?: string;
    group?: string;
  }): Promise<{ items: CanonicalChannel[]; total: number }>;
  findById(id: string): Promise<CanonicalChannel | null>;
  findByEpgChannelId(epgChannelId: string): Promise<CanonicalChannel | null>;
  findByMergedFromId(mergedFromId: string): Promise<CanonicalChannel | null>;
  createBatch(channels: Omit<CanonicalChannel, "id" | "createdAt" | "updatedAt">[]): Promise<CanonicalChannel[]>;
  update(id: string, data: Partial<CanonicalChannel>): Promise<CanonicalChannel | null>;
  deleteAll(): Promise<number>;
  batchUpdate(ids: string[], data: Partial<CanonicalChannel>): Promise<number>;
  batchDelete(ids: string[]): Promise<number>;
  findGroups(): Promise<{ name: string; count: number }[]>;
}

export interface IStreamEnrichmentService {
  getSourceNames(ids: string[]): Promise<Map<string, string>>;
  getChannelNames(ids: string[]): Promise<Map<string, string>>;
}

export interface IHealthStatsRepository {
  getStreamHealthStats(): Promise<{
    total: number;
    online: number;
    offline: number;
    degraded: number;
    unknown: number;
    avgResponseTime: number | null;
  }>;
  getChannelOutputStats(): Promise<{
    total: number;
    active: number;
    degraded: number;
    unavailable: number;
  }>;
}

export interface IChannelOverrideRepository {
  findByChannelId(channelId: string): Promise<ChannelOverride | null>;
  upsert(channelId: string, data: Partial<Omit<ChannelOverride, "id" | "channelId" | "createdAt" | "updatedAt">>): Promise<ChannelOverride>;
  deleteByChannelId(channelId: string): Promise<boolean>;
}

export interface IChannelStreamRepository {
  findByCanonicalChannelId(canonicalChannelId: string): Promise<ChannelStream[]>;
  findByCanonicalChannelIdWithSource(canonicalChannelId: string): Promise<StreamWithSource[]>;
  findById(id: string): Promise<ChannelStream | null>;
  create(data: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">): Promise<ChannelStream>;
  createBatch(streams: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">[]): Promise<ChannelStream[]>;
  update(id: string, data: Partial<ChannelStream>): Promise<ChannelStream | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByCanonicalChannelId(canonicalChannelId: string): Promise<number>;
}
