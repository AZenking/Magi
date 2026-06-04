import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { IChannelRepository, Channel, EpgMatchType, StreamStatus } from "@/domain/channel-catalog";
import { db } from "./connection";
import { channels } from "./schema";

function toDomain(row: typeof channels.$inferSelect): Channel {
  return {
    ...row,
    epgMatchType: row.epgMatchType as EpgMatchType,
    streamStatus: row.streamStatus as StreamStatus | null,
  };
}

export class ChannelRepository implements IChannelRepository {
  async findAll(query: { page: number; pageSize: number }): Promise<{ items: Channel[]; total: number }> {
    const { page, pageSize } = query;
    const [items, countResult] = await Promise.all([
      db.select().from(channels).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(channels),
    ]);
    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<Channel | null> {
    const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIdentity(channelIdentity: string): Promise<Channel | null> {
    const [row] = await db.select().from(channels).where(eq(channels.channelIdentity, channelIdentity)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByM3uSourceId(sourceId: string): Promise<Channel[]> {
    const rows = await db.select().from(channels).where(eq(channels.m3uSourceId, sourceId));
    return rows.map(toDomain);
  }

  async createBatch(channelData: Omit<Channel, "id" | "createdAt" | "updatedAt">[]): Promise<Channel[]> {
    if (channelData.length === 0) return [];
    const rows = await db.insert(channels).values(channelData).returning();
    return rows.map(toDomain);
  }

  async update(id: string, data: Partial<Channel>): Promise<Channel | null> {
    const [row] = await db
      .update(channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channels.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async deleteByM3uSourceId(sourceId: string): Promise<number> {
    const result = await db.delete(channels).where(eq(channels.m3uSourceId, sourceId)).returning();
    return result.length;
  }
}
