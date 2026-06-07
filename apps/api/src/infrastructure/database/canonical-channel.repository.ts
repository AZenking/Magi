import { eq, and, sql, ilike, inArray } from "drizzle-orm";
import type { ICanonicalChannelRepository, CanonicalChannel, EpgStatus, OutputStatus } from "@/domain/output-composition";
import { db } from "./connection";
import { canonicalChannels } from "./schema";

function toDomain(row: typeof canonicalChannels.$inferSelect): CanonicalChannel {
  return {
    ...row,
    epgStatus: row.epgStatus as EpgStatus,
    outputStatus: row.outputStatus as OutputStatus,
    mergedFromIds: row.mergedFromIds,
    mergeMethod: row.mergeMethod as CanonicalChannel["mergeMethod"],
  };
}

export class CanonicalChannelRepository implements ICanonicalChannelRepository {
  async findAll(params: {
    page: number;
    pageSize: number;
    epgStatus?: string;
    outputStatus?: string;
    hidden?: boolean;
    disabled?: boolean;
    search?: string;
  }): Promise<{ items: CanonicalChannel[]; total: number }> {
    const { page, pageSize, epgStatus, outputStatus, hidden, disabled, search } = params;
    const conditions = [];
    if (epgStatus) conditions.push(eq(canonicalChannels.epgStatus, epgStatus));
    if (outputStatus) conditions.push(eq(canonicalChannels.outputStatus, outputStatus));
    if (hidden !== undefined) conditions.push(eq(canonicalChannels.hidden, hidden));
    if (disabled !== undefined) conditions.push(eq(canonicalChannels.disabled, disabled));
    if (search) conditions.push(ilike(canonicalChannels.standardName, `%${search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(canonicalChannels).where(where).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(canonicalChannels).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<CanonicalChannel | null> {
    const [row] = await db.select().from(canonicalChannels).where(eq(canonicalChannels.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByEpgChannelId(epgChannelId: string): Promise<CanonicalChannel | null> {
    const [row] = await db.select().from(canonicalChannels).where(eq(canonicalChannels.epgChannelId, epgChannelId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByMergedFromId(mergedFromId: string): Promise<CanonicalChannel | null> {
    const [row] = await db.select().from(canonicalChannels).where(eq(canonicalChannels.mergedFromIds, mergedFromId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async createBatch(channels: Omit<CanonicalChannel, "id" | "createdAt" | "updatedAt">[]): Promise<CanonicalChannel[]> {
    if (channels.length === 0) return [];
    const rows = await db.insert(canonicalChannels).values(channels).returning();
    return rows.map(toDomain);
  }

  async update(id: string, data: Partial<CanonicalChannel>): Promise<CanonicalChannel | null> {
    const [row] = await db
      .update(canonicalChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(canonicalChannels.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async deleteAll(): Promise<number> {
    const result = await db.delete(canonicalChannels).returning();
    return result.length;
  }

  async batchUpdate(ids: string[], data: Partial<CanonicalChannel>): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(canonicalChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(inArray(canonicalChannels.id, ids))
      .returning();
    return result.length;
  }

  async batchDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.delete(canonicalChannels).where(inArray(canonicalChannels.id, ids)).returning();
    return result.length;
  }
}
