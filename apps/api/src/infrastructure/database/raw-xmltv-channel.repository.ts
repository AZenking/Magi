import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { IRawXmltvChannelRepository, RawXmltvChannel } from "@/domain/channel-catalog";
import { db } from "./connection";
import { rawXmltvChannels } from "./schema";

function toDomain(row: typeof rawXmltvChannels.$inferSelect): RawXmltvChannel {
  return {
    ...row,
    displayName: row.displayName ?? "",
    icon: row.icon ?? "",
  };
}

export class RawXmltvChannelRepository implements IRawXmltvChannelRepository {
  async findBySourceId(sourceId: string): Promise<RawXmltvChannel[]> {
    const rows = await db.select().from(rawXmltvChannels).where(eq(rawXmltvChannels.sourceId, sourceId));
    return rows.map(toDomain);
  }

  async findCandidates(params: { sourceId?: string; search?: string; page: number; pageSize: number }): Promise<{ items: RawXmltvChannel[]; total: number }> {
    const conditions = [];
    if (params.sourceId) conditions.push(eq(rawXmltvChannels.sourceId, params.sourceId));
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(or(ilike(rawXmltvChannels.xmltvId, term), ilike(rawXmltvChannels.displayName, term))!);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(rawXmltvChannels).where(where).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(rawXmltvChannels).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async createBatch(channels: Omit<RawXmltvChannel, "id" | "createdAt" | "updatedAt">[]): Promise<RawXmltvChannel[]> {
    if (channels.length === 0) return [];
    const rows = await db.insert(rawXmltvChannels).values(channels).returning();
    return rows.map(toDomain);
  }

  async deleteBySourceId(sourceId: string): Promise<number> {
    const result = await db.delete(rawXmltvChannels).where(eq(rawXmltvChannels.sourceId, sourceId)).returning();
    return result.length;
  }
}
