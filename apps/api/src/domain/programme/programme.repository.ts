import type { Programme } from "./programme.model";

export interface IProgrammeRepository {
  findAll(query: { page: number; pageSize: number; channelId?: string }): Promise<{ items: Programme[]; total: number }>;
  findById(id: string): Promise<Programme | null>;
  createBatch(programmes: Omit<Programme, "id" | "createdAt" | "updatedAt">[]): Promise<Programme[]>;
  deleteByChannelAndDateRange(channelId: string, start: Date, stop: Date): Promise<number>;
}
