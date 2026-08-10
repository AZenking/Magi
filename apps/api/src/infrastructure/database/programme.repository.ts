import { eq, and, gt, gte, lt, lte, sql, or } from "drizzle-orm";
import type { IProgrammeRepository, Programme } from "@/domain/channel-catalog";
import { db } from "./connection";
import { programmes } from "./schema";

function toDomain(row: typeof programmes.$inferSelect): Programme {
  return { ...row };
}

export class ProgrammeRepository implements IProgrammeRepository {
  async findById(id: string): Promise<Programme | null> {
    const [row] = await db
      .select()
      .from(programmes)
      .where(eq(programmes.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findAll(params: {
    page: number;
    pageSize: number;
    xmltvChannelId?: string;
    sourceId?: string;
  }): Promise<{ items: Programme[]; total: number }> {
    const conditions = [];
    if (params.xmltvChannelId)
      conditions.push(eq(programmes.xmltvChannelId, params.xmltvChannelId));
    if (params.sourceId)
      conditions.push(eq(programmes.sourceId, params.sourceId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, pageSize } = params;

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(programmes)
        .where(where)
        .orderBy(programmes.startAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(programmes)
        .where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findBySourceId(sourceId: string): Promise<Programme[]> {
    const rows = await db
      .select()
      .from(programmes)
      .where(eq(programmes.sourceId, sourceId));
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
      db
        .select()
        .from(programmes)
        .where(where)
        .orderBy(programmes.startAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(programmes)
        .where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findBySourceChannelAndRange(
    bindings: readonly { sourceId: string; xmltvChannelId: string }[],
    startAt?: Date,
    stopAt?: Date,
  ): Promise<Programme[]> {
    if (bindings.length === 0) return [];
    const pairs = bindings.map((binding) =>
      and(
        eq(programmes.sourceId, binding.sourceId),
        eq(programmes.xmltvChannelId, binding.xmltvChannelId),
      ),
    );
    const conditions = [or(...pairs)!];
    if (startAt) conditions.push(gt(programmes.stopAt, startAt));
    if (stopAt) conditions.push(lt(programmes.startAt, stopAt));
    const rows = await db
      .select()
      .from(programmes)
      .where(and(...conditions))
      .orderBy(programmes.startAt);
    return rows.map(toDomain);
  }

  async createBatch(
    programmeData: Omit<Programme, "id" | "createdAt">[],
  ): Promise<Programme[]> {
    if (programmeData.length === 0) return [];
    const BATCH_SIZE = 500;
    const allRows: Programme[] = [];
    await db.transaction(async (tx) => {
      for (let i = 0; i < programmeData.length; i += BATCH_SIZE) {
        const batch = programmeData.slice(i, i + BATCH_SIZE);
        const rows = await tx.insert(programmes).values(batch).returning();
        allRows.push(...rows.map(toDomain));
      }
    });
    return allRows;
  }

  async deleteBySourceId(sourceId: string): Promise<number> {
    const result = await db
      .delete(programmes)
      .where(eq(programmes.sourceId, sourceId))
      .returning();
    return result.length;
  }
}
