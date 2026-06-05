import type { CanonicalChannel } from "./canonical-channel.model";
import type { ChannelOverride } from "./channel-override.model";
import type { ChannelStream } from "./channel-stream.model";

export interface ICanonicalChannelRepository {
  findAll(params: {
    page: number;
    pageSize: number;
    epgStatus?: string;
    outputStatus?: string;
    hidden?: boolean;
  }): Promise<{ items: CanonicalChannel[]; total: number }>;
  findById(id: string): Promise<CanonicalChannel | null>;
  findByEpgChannelId(epgChannelId: string): Promise<CanonicalChannel | null>;
  findByMergedFromId(mergedFromId: string): Promise<CanonicalChannel | null>;
  createBatch(channels: Omit<CanonicalChannel, "id" | "createdAt" | "updatedAt">[]): Promise<CanonicalChannel[]>;
  update(id: string, data: Partial<CanonicalChannel>): Promise<CanonicalChannel | null>;
  deleteAll(): Promise<number>;
}

export interface IChannelOverrideRepository {
  findByChannelId(channelId: string): Promise<ChannelOverride | null>;
  upsert(channelId: string, data: Partial<Omit<ChannelOverride, "id" | "channelId" | "createdAt" | "updatedAt">>): Promise<ChannelOverride>;
  deleteByChannelId(channelId: string): Promise<boolean>;
}

export interface IChannelStreamRepository {
  findByCanonicalChannelId(canonicalChannelId: string): Promise<ChannelStream[]>;
  findById(id: string): Promise<ChannelStream | null>;
  create(data: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">): Promise<ChannelStream>;
  createBatch(streams: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">[]): Promise<ChannelStream[]>;
  update(id: string, data: Partial<ChannelStream>): Promise<ChannelStream | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByCanonicalChannelId(canonicalChannelId: string): Promise<number>;
}
