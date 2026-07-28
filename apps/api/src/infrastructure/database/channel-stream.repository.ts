import { eq, asc, and, inArray } from "drizzle-orm";
import type { IChannelStreamRepository, ChannelStream, StreamWithSource, HealthStatus } from "@/domain/output-composition";
import { db } from "./connection";
import { channelStreams, m3uSources } from "./schema";

function toDomain(row: typeof channelStreams.$inferSelect): ChannelStream {
  return {
    ...row,
    healthStatus: row.healthStatus as HealthStatus,
    origin: (row.origin ?? undefined) as ChannelStream["origin"],
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

  // --- Safe Operations (T018 ports). T115 implementations. ---
  async findOrderedByCanonicalChannelId(canonicalChannelId: string): Promise<ChannelStream[]> {
    const rows = await db
      .select()
      .from(channelStreams)
      .where(eq(channelStreams.canonicalChannelId, canonicalChannelId))
      .orderBy(asc(channelStreams.position), asc(channelStreams.createdAt));
    return rows.map(toDomain);
  }

  /**
   * Atomically rewrite the ordered set of streams for a channel (FR-031).
   * Positions are contiguous from 0; runs as a single transaction so a partial
   * failure leaves ordering unchanged.
   */
  async reorder(canonicalChannelId: string, orderedIds: readonly string[]): Promise<ChannelStream[]> {
    if (orderedIds.length === 0) return [];
    await db.transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          tx
            .update(channelStreams)
            .set({ position: index, updatedAt: new Date() })
            .where(and(eq(channelStreams.id, id), eq(channelStreams.canonicalChannelId, canonicalChannelId))),
        ),
      );
    });
    const rows = await db
      .select()
      .from(channelStreams)
      .where(
        and(
          eq(channelStreams.canonicalChannelId, canonicalChannelId),
          inArray(channelStreams.id, [...orderedIds]),
        ),
      )
      .orderBy(asc(channelStreams.position));
    return rows.map(toDomain);
  }
}
