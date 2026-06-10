import { eq, and, notInArray } from "drizzle-orm";
import type { IRawM3uChannelRepository, RawM3uChannel } from "@/domain/channel-catalog";
import { db } from "./connection";
import { rawM3uChannels } from "./schema";

function toDomain(row: typeof rawM3uChannels.$inferSelect): RawM3uChannel {
  return {
    ...row,
    tvgId: row.tvgId ?? "",
    tvgName: row.tvgName ?? "",
    tvgLogo: row.tvgLogo ?? "",
    groupTitle: row.groupTitle ?? "",
  };
}

export class RawM3uChannelRepository implements IRawM3uChannelRepository {
  async findBySourceId(sourceId: string): Promise<RawM3uChannel[]> {
    const rows = await db.select().from(rawM3uChannels).where(eq(rawM3uChannels.sourceId, sourceId));
    return rows.map(toDomain);
  }

  async findBySourceIdAndIdentity(sourceId: string, channelIdentity: string): Promise<RawM3uChannel | null> {
    const [row] = await db
      .select()
      .from(rawM3uChannels)
      .where(and(eq(rawM3uChannels.sourceId, sourceId), eq(rawM3uChannels.channelIdentity, channelIdentity)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async createBatch(channels: Omit<RawM3uChannel, "id" | "createdAt" | "updatedAt">[]): Promise<RawM3uChannel[]> {
    if (channels.length === 0) return [];
    const rows = await db.insert(rawM3uChannels).values(channels).returning();
    return rows.map(toDomain);
  }

  async updateDisappearedFlag(sourceId: string, activeIdentities: string[]): Promise<number> {
    if (activeIdentities.length === 0) {
      const result = await db
        .update(rawM3uChannels)
        .set({ disappeared: true, updatedAt: new Date() })
        .where(eq(rawM3uChannels.sourceId, sourceId))
        .returning();
      return result.length;
    }
    const result = await db
      .update(rawM3uChannels)
      .set({ disappeared: true, updatedAt: new Date() })
      .where(
        and(
          eq(rawM3uChannels.sourceId, sourceId),
          notInArray(rawM3uChannels.channelIdentity, activeIdentities),
        ),
      )
      .returning();
    return result.length;
  }

  async deleteBySourceId(sourceId: string): Promise<number> {
    const result = await db.delete(rawM3uChannels).where(eq(rawM3uChannels.sourceId, sourceId)).returning();
    return result.length;
  }
}
