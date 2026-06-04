import type { RawM3uChannel } from "./raw-channel.model";
import type { Channel } from "./channel.model";
import type { Programme } from "./programme.model";

export interface IRawM3uChannelRepository {
  findBySourceId(sourceId: string): Promise<RawM3uChannel[]>;
  findBySourceIdAndIdentity(sourceId: string, channelIdentity: string): Promise<RawM3uChannel | null>;
  createBatch(channels: Omit<RawM3uChannel, "id" | "createdAt" | "updatedAt">[]): Promise<RawM3uChannel[]>;
  updateDisappearedFlag(sourceId: string, activeIdentities: string[]): Promise<number>;
  deleteBySourceId(sourceId: string): Promise<number>;
}

export interface IRawXmltvChannelRepository {
  findBySourceId(sourceId: string): Promise<import("./raw-channel.model").RawXmltvChannel[]>;
  createBatch(channels: Omit<import("./raw-channel.model").RawXmltvChannel, "id" | "createdAt" | "updatedAt">[]): Promise<import("./raw-channel.model").RawXmltvChannel[]>;
  deleteBySourceId(sourceId: string): Promise<number>;
}

export interface IChannelRepository {
  findAll(query: { page: number; pageSize: number }): Promise<{ items: Channel[]; total: number }>;
  findById(id: string): Promise<Channel | null>;
  findByIdentity(channelIdentity: string): Promise<Channel | null>;
  findByM3uSourceId(sourceId: string): Promise<Channel[]>;
  createBatch(channels: Omit<Channel, "id" | "createdAt" | "updatedAt">[]): Promise<Channel[]>;
  update(id: string, data: Partial<Channel>): Promise<Channel | null>;
  deleteByM3uSourceId(sourceId: string): Promise<number>;
}

export interface IProgrammeRepository {
  findById(id: string): Promise<Programme | null>;
  findAll(params: {
    page: number;
    pageSize: number;
    xmltvChannelId?: string;
    sourceId?: string;
  }): Promise<{ items: Programme[]; total: number }>;
  findBySourceId(sourceId: string): Promise<Programme[]>;
  findByXmltvChannelId(xmltvChannelId: string, params: {
    startAt?: Date;
    stopAt?: Date;
    page: number;
    pageSize: number;
  }): Promise<{ items: Programme[]; total: number }>;
  createBatch(programmes: Omit<Programme, "id" | "createdAt">[]): Promise<Programme[]>;
  deleteBySourceId(sourceId: string): Promise<number>;
}
