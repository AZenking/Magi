import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { EpgSource } from "../../domain/epg/epg.model";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";
import { db } from "./connection";
import { epgSources, channels } from "./schema";

const ALLOWED_SORT_KEYS = ["name", "enabled", "lastSyncedAt", "createdAt"] as const;

function escapeLike(str: string): string {
  return str.replace(/[%_]/g, "\\$&");
}

export class EpgSourceRepository implements IEpgSourceRepository {
  async findAll(): Promise<EpgSource[]> {
    return db.select().from(epgSources);
  }

  async findById(id: string): Promise<EpgSource | null> {
    const [row] = await db.select().from(epgSources).where(eq(epgSources.id, id)).limit(1);
    return row ?? null;
  }

  async create(data: Omit<EpgSource, "id" | "createdAt" | "updatedAt">): Promise<EpgSource> {
    const [row] = await db.insert(epgSources).values(data).returning();
    return row!;
  }

  async update(id: string, data: Partial<EpgSource>): Promise<EpgSource> {
    const [row] = await db
      .update(epgSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(epgSources.id, id))
      .returning();
    if (!row) return null!;
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db
      .delete(epgSources)
      .where(eq(epgSources.id, id))
      .returning();
    return !!row;
  }

  async updateLastSynced(id: string): Promise<void> {
    await db
      .update(epgSources)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(epgSources.id, id));
  }

  async findPaginated(params: {
    type?: string;
    search?: string;
    page: number;
    pageSize: number;
    sortBy: string;
    sortDir: "asc" | "desc";
  }): Promise<{ items: EpgSource[]; total: number }> {
    const { type, search, page, pageSize, sortBy, sortDir } = params;

    const conditions = [];
    if (type) conditions.push(eq(epgSources.type, type));
    if (search) {
      const escaped = escapeLike(search);
      conditions.push(
        or(
          ilike(epgSources.name, `%${escaped}%`),
          ilike(epgSources.url, `%${escaped}%`),
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortKey = (ALLOWED_SORT_KEYS as readonly string[]).includes(sortBy)
      ? sortBy
      : "createdAt";
    const orderExpr =
      sortDir === "asc"
        ? sql`${epgSources[sortKey as keyof typeof epgSources]} asc`
        : sql`${epgSources[sortKey as keyof typeof epgSources]} desc`;

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(epgSources)
        .where(where)
        .orderBy(orderExpr)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(epgSources)
        .where(where),
    ]);

    return { items, total: countResult[0]?.count ?? 0 };
  }

  async clearChannelBindings(sourceId: string): Promise<void> {
    await db
      .update(channels)
      .set({ epgSourceId: null })
      .where(eq(channels.epgSourceId, sourceId as typeof channels.epgSourceId.dataType));
  }
}
