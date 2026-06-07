import { eq, and } from "drizzle-orm";
import type { IChannelStreamRepository, ChannelStream, StreamWithSource, HealthStatus } from "@/domain/output-composition";
import { db } from "./connection";
import { channelStreams, m3uSources } from "./schema";

function toDomain(row: typeof channelStreams.$inferSelect): ChannelStream {
  return {
    ...row,
    healthStatus: row.healthStatus as HealthStatus,
  };
}

export class ChannelStreamRepository implements IChannelStreamRepository {
  async findByCanonicalChannelId(canonicalChannelId: string): Promise<ChannelStream[]> {
    const rows = await db.select().from(channelStreams).where(eq(channelStreams.canonicalChannelId, canonicalChannelId));
    return rows.map(toDomain);
  }

  async findByCanonicalChannelIdWithSource(canonicalChannelId: string): Promise<StreamWithSource[]> {
    const rows = await db
      .select({
        stream: channelStreams,
        sourcePriority: m3uSources.priority,
        sourceParticipateInOutput: m3uSources.participateInOutput,
        sourceAllowFallback: m3uSources.allowFallback,
      })
      .from(channelStreams)
      .leftJoin(m3uSources, eq(channelStreams.m3uSourceId, m3uSources.id))
      .where(eq(channelStreams.canonicalChannelId, canonicalChannelId));

    return rows.map((r) => ({
      ...toDomain(r.stream),
      sourcePriority: r.sourcePriority ?? null,
      sourceParticipateInOutput: r.sourceParticipateInOutput ?? null,
      sourceAllowFallback: r.sourceAllowFallback ?? null,
    }));
  }

  async findById(id: string): Promise<ChannelStream | null> {
    const [row] = await db.select().from(channelStreams).where(eq(channelStreams.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(data: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">): Promise<ChannelStream> {
    const [row] = await db.insert(channelStreams).values(data).returning();
    return toDomain(row!);
  }

  async createBatch(streams: Omit<ChannelStream, "id" | "createdAt" | "updatedAt">[]): Promise<ChannelStream[]> {
    if (streams.length === 0) return [];
    const rows = await db.insert(channelStreams).values(streams).returning();
    return rows.map(toDomain);
  }

  async update(id: string, data: Partial<ChannelStream>): Promise<ChannelStream | null> {
    const [row] = await db
      .update(channelStreams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channelStreams.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const [row] = await db.delete(channelStreams).where(eq(channelStreams.id, id)).returning();
    return !!row;
  }

  async deleteByCanonicalChannelId(canonicalChannelId: string): Promise<number> {
    const result = await db.delete(channelStreams).where(eq(channelStreams.canonicalChannelId, canonicalChannelId)).returning();
    return result.length;
  }
}
