import { eq } from "drizzle-orm";
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
