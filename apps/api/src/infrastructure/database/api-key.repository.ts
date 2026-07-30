/**
 * ApiKeyRepository — Drizzle implementation (005-open-channels-epg-api).
 *
 * Implements IApiKeyRepository against `api_keys` (constitution III: the port
 * lives in domain/, this concrete class lives in infrastructure/).
 */
import { eq, and, sql, ilike, isNull, or, gt } from "drizzle-orm";
import type { ApiKey, ApiKeyStatus, IApiKeyRepository, CreateApiKeyInput, ListApiKeysQuery } from "@/domain/api-key";
import { db } from "./connection";
import { apiKeys } from "./schema";

function toDomain(row: typeof apiKeys.$inferSelect): ApiKey {
  return {
    ...row,
    status: row.status as ApiKeyStatus,
  };
}

export class ApiKeyRepository implements IApiKeyRepository {
  async create(data: CreateApiKeyInput): Promise<ApiKey> {
    const [row] = await db
      .insert(apiKeys)
      .values({
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        status: data.status ?? "active",
        expiresAt: data.expiresAt ?? null,
        scopes: data.scopes ?? null,
        createdBy: data.createdBy,
      })
      .returning();
    return toDomain(row!);
  }

  async findById(id: string): Promise<ApiKey | null> {
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  /**
   * Hot path for ApiKeyGuard. Returns the key ONLY when it is active AND not
   * expired — so a single lookup answers both existence and usability.
   */
  async findActiveByHash(keyHash: string): Promise<ApiKey | null> {
    const [row] = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.status, "active"),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findPaginated(query: ListApiKeysQuery): Promise<{ items: ApiKey[]; total: number }> {
    const { page, pageSize, status, search } = query;
    const conditions = [];
    if (status) conditions.push(eq(apiKeys.status, status));
    if (search) conditions.push(ilike(apiKeys.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(apiKeys).where(where).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(apiKeys).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async updateStatus(id: string, status: ApiKeyStatus): Promise<ApiKey | null> {
    const [row] = await db
      .update(apiKeys)
      .set({ status, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async touchLastUsed(id: string, at: Date = new Date()): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }

  async deleteById(id: string): Promise<boolean> {
    const [row] = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();
    return !!row;
  }
}
