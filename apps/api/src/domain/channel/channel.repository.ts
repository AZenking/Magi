import type { Channel } from "./channel.model";

export interface IChannelRepository {
  findAll(query: { page: number; pageSize: number }): Promise<{ items: Channel[]; total: number }>;
  findById(id: string): Promise<Channel | null>;
  create(data: Omit<Channel, "id" | "createdAt" | "updatedAt">): Promise<Channel>;
  update(id: string, data: Partial<Channel>): Promise<Channel>;
  delete(id: string): Promise<void>;
}
