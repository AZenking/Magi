import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { IM3uSourceRepository, FindSourcesParams, PaginatedSourcesResult, M3uSource, M3uUpdateData, SourceRole, SyncStatus, CheckStatus } from "@/domain/source-management";
import { db } from "./connection";
import { m3uSources } from "./schema";

const ALLOWED_SORT_KEYS = ["name", "enabled", "priority", "lastSyncAt", "createdAt"] as const;

function escapeLike(str: string): string {
  return str.replace(/[%_]/g, "\\$&");
}

function toDomain(row: typeof m3uSources.$inferSelect): M3uSource {
  return {
    ...row,
    type: "m3u",
    role: row.role as SourceRole,
    lastSyncStatus: row.lastSyncStatus as SyncStatus,
    checkStatus: row.checkStatus as CheckStatus,
  };
}

export class M3uSourceRepository implements IM3uSourceRepository {
  async findAll(): Promise<M3uSource[]> {
    const rows = await db.select().from(m3uSources);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<M3uSource | null> {
    const [row] = await db.select().from(m3uSources).where(eq(m3uSources.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findPaginated(params: FindSourcesParams): Promise<PaginatedSourcesResult<M3uSource>> {
    const { search, page, pageSize, sortBy, sortDir } = params;
    const conditions = [];
    if (search) {
      const escaped = escapeLike(search);
      conditions.push(or(ilike(m3uSources.name, `%${escaped}%`), ilike(m3uSources.url, `%${escaped}%`))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortKey = (ALLOWED_SORT_KEYS as readonly string[]).includes(sortBy) ? sortBy : "createdAt";
    const orderExpr =
      sortDir === "asc"
        ? sql`${m3uSources[sortKey as keyof typeof m3uSources]} asc`
        : sql`${m3uSources[sortKey as keyof typeof m3uSources]} desc`;

    const [items, countResult] = await Promise.all([
      db.select().from(m3uSources).where(where).orderBy(orderExpr).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(m3uSources).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async create(data: Omit<M3uSource, "id" | "type" | "createdAt" | "updatedAt" | "failureCount" | "lastSuccessAt" | "qualityScore" | "lastSyncAt" | "lastSyncStatus" | "lastCheckAt" | "checkStatus" | "checkResponseTime" | "checkError">): Promise<M3uSource> {
    const [row] = await db.insert(m3uSources).values(data).returning();
    return toDomain(row!);
  }

  async update(id: string, data: M3uUpdateData): Promise<M3uSource | null> {
    const [row] = await db
      .update(m3uSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(m3uSources.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db.delete(m3uSources).where(eq(m3uSources.id, id)).returning();
    return !!row;
  }

  async updateSyncStatus(id: string, status: { lastSyncAt: Date; lastSyncStatus: string }): Promise<void> {
    await db.update(m3uSources).set({ ...status, updatedAt: new Date() }).where(eq(m3uSources.id, id));
  }

  // --- Safe Operations (T022 port). Real implementation lands in T024. ---
  async updateIfVersion(_id: string, _data: M3uUpdateData, _expectedVersion: number): Promise<M3uSource | null> {
    throw new Error("T024: updateIfVersion not implemented yet");
  }
}
