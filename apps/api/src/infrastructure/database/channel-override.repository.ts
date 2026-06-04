import { eq } from "drizzle-orm";
import type { IChannelOverrideRepository, ChannelOverride } from "@/domain/output-composition";
import { db } from "./connection";
import { channelOverrides } from "./schema";

function toDomain(row: typeof channelOverrides.$inferSelect): ChannelOverride {
  return { ...row };
}

export class ChannelOverrideRepository implements IChannelOverrideRepository {
  async findByChannelId(channelId: string): Promise<ChannelOverride | null> {
    const [row] = await db.select().from(channelOverrides).where(eq(channelOverrides.channelId, channelId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async upsert(
    channelId: string,
    data: Partial<Omit<ChannelOverride, "id" | "channelId" | "createdAt" | "updatedAt">>,
  ): Promise<ChannelOverride> {
    const existing = await this.findByChannelId(channelId);
    if (existing) {
      const [row] = await db
        .update(channelOverrides)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(channelOverrides.id, existing.id))
        .returning();
      return toDomain(row!);
    }
    const [row] = await db
      .insert(channelOverrides)
      .values({ channelId, ...data })
      .returning();
    return toDomain(row!);
  }

  async deleteByChannelId(channelId: string): Promise<boolean> {
    const [row] = await db.delete(channelOverrides).where(eq(channelOverrides.channelId, channelId)).returning();
    return !!row;
  }
}
