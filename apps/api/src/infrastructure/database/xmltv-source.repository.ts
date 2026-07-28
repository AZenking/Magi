import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { IXmltvSourceRepository, FindSourcesParams, PaginatedSourcesResult, XmltvSource, XmltvUpdateData, SourceRole, SyncStatus, CheckStatus } from "@/domain/source-management";
import { db } from "./connection";
import { xmltvSources, programmes } from "./schema";

const ALLOWED_SORT_KEYS = ["name", "enabled", "priority", "lastSyncAt", "createdAt"] as const;

function escapeLike(str: string): string {
  return str.replace(/[%_]/g, "\\$&");
}

function toDomain(row: typeof xmltvSources.$inferSelect): XmltvSource {
  return {
    ...row,
    type: "xmltv",
    role: row.role as SourceRole,
    lastSyncStatus: row.lastSyncStatus as SyncStatus,
    checkStatus: row.checkStatus as CheckStatus,
  };
}

export class XmltvSourceRepository implements IXmltvSourceRepository {
  async findAll(): Promise<XmltvSource[]> {
    const rows = await db.select().from(xmltvSources);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<XmltvSource | null> {
    const [row] = await db.select().from(xmltvSources).where(eq(xmltvSources.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findPaginated(params: FindSourcesParams): Promise<PaginatedSourcesResult<XmltvSource>> {
    const { search, page, pageSize, sortBy, sortDir } = params;
    const conditions = [];
    if (search) {
      const escaped = escapeLike(search);
      conditions.push(or(ilike(xmltvSources.name, `%${escaped}%`), ilike(xmltvSources.url, `%${escaped}%`))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortKey = (ALLOWED_SORT_KEYS as readonly string[]).includes(sortBy) ? sortBy : "createdAt";
    const orderExpr =
      sortDir === "asc"
        ? sql`${xmltvSources[sortKey as keyof typeof xmltvSources]} asc`
        : sql`${xmltvSources[sortKey as keyof typeof xmltvSources]} desc`;

    const [items, countResult] = await Promise.all([
      db.select().from(xmltvSources).where(where).orderBy(orderExpr).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(xmltvSources).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async create(data: Omit<XmltvSource, "id" | "type" | "createdAt" | "updatedAt" | "failureCount" | "lastSuccessAt" | "qualityScore" | "lastSyncAt" | "lastSyncStatus" | "lastCheckAt" | "checkStatus" | "checkResponseTime" | "checkError">): Promise<XmltvSource> {
    const [row] = await db.insert(xmltvSources).values(data).returning();
    return toDomain(row!);
  }

  async update(id: string, data: XmltvUpdateData): Promise<XmltvSource | null> {
    const [row] = await db
      .update(xmltvSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(xmltvSources.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db.delete(xmltvSources).where(eq(xmltvSources.id, id)).returning();
    return !!row;
  }

  async updateSyncStatus(id: string, status: { lastSyncAt: Date; lastSyncStatus: string }): Promise<void> {
    await db.update(xmltvSources).set({ ...status, updatedAt: new Date() }).where(eq(xmltvSources.id, id));
  }

  async clearProgrammeBindings(sourceId: string): Promise<void> {
    await db.delete(programmes).where(eq(programmes.sourceId, sourceId));
  }

  // --- Safe Operations (T022 port). Real implementation lands in T024. ---
  async updateIfVersion(_id: string, _data: XmltvUpdateData, _expectedVersion: number): Promise<XmltvSource | null> {
    throw new Error("T024: updateIfVersion not implemented yet");
  }
}
