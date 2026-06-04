import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { IProgrammeRepository, Programme } from "@/domain/channel-catalog";
import { db } from "./connection";
import { programmes } from "./schema";

function toDomain(row: typeof programmes.$inferSelect): Programme {
  return { ...row };
}

export class ProgrammeRepository implements IProgrammeRepository {
  async findById(id: string): Promise<Programme | null> {
    const [row] = await db.select().from(programmes).where(eq(programmes.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findAll(params: {
    page: number;
    pageSize: number;
    xmltvChannelId?: string;
    sourceId?: string;
  }): Promise<{ items: Programme[]; total: number }> {
    const conditions = [];
    if (params.xmltvChannelId) conditions.push(eq(programmes.xmltvChannelId, params.xmltvChannelId));
    if (params.sourceId) conditions.push(eq(programmes.sourceId, params.sourceId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, pageSize } = params;

    const [items, countResult] = await Promise.all([
      db.select().from(programmes).where(where).orderBy(programmes.startAt).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(programmes).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findBySourceId(sourceId: string): Promise<Programme[]> {
    const rows = await db.select().from(programmes).where(eq(programmes.sourceId, sourceId));
    return rows.map(toDomain);
  }

  async findByXmltvChannelId(
    xmltvChannelId: string,
    params: { startAt?: Date; stopAt?: Date; page: number; pageSize: number },
  ): Promise<{ items: Programme[]; total: number }> {
    const conditions = [eq(programmes.xmltvChannelId, xmltvChannelId)];
    if (params.startAt) conditions.push(gte(programmes.stopAt, params.startAt));
    if (params.stopAt) conditions.push(lte(programmes.startAt, params.stopAt));

    const where = and(...conditions);
    const { page, pageSize } = params;

    const [items, countResult] = await Promise.all([
      db.select().from(programmes).where(where).orderBy(programmes.startAt).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(programmes).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async createBatch(programmeData: Omit<Programme, "id" | "createdAt">[]): Promise<Programme[]> {
    if (programmeData.length === 0) return [];
    const BATCH_SIZE = 500;
    const allRows: Programme[] = [];
    for (let i = 0; i < programmeData.length; i += BATCH_SIZE) {
      const batch = programmeData.slice(i, i + BATCH_SIZE);
      const rows = await db.insert(programmes).values(batch).returning();
      allRows.push(...rows.map(toDomain));
    }
    return allRows;
  }

  async deleteBySourceId(sourceId: string): Promise<number> {
    const result = await db.delete(programmes).where(eq(programmes.sourceId, sourceId)).returning();
    return result.length;
  }
}
