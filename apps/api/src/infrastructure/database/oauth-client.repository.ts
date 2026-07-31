/**
 * OauthClientRepository — Drizzle implementation (004-safe-operations).
 *
 * Implements IOauthClientRepository against `oauth_clients` (constitution III:
 * the port lives in domain/, this concrete class lives in infrastructure/).
 */
import { eq, and, sql, ilike } from "drizzle-orm";
import type {
  OauthClient,
  ClientStatus,
  IOauthClientRepository,
  CreateOauthClientInput,
  ListOauthClientsQuery,
} from "@/domain/oauth";
import { db } from "./connection";
import { oauthClients } from "./schema";

function toDomain(row: typeof oauthClients.$inferSelect): OauthClient {
  return {
    ...row,
    status: row.status as ClientStatus,
  };
}

export class OauthClientRepository implements IOauthClientRepository {
  async create(data: CreateOauthClientInput): Promise<OauthClient> {
    const [row] = await db
      .insert(oauthClients)
      .values({
        clientId: data.clientId,
        clientName: data.clientName,
        secretHash: data.secretHash,
        secretPrefix: data.secretPrefix,
        status: data.status ?? "active",
        createdBy: data.createdBy,
      })
      .returning();
    return toDomain(row!);
  }

  async findById(id: string): Promise<OauthClient | null> {
    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByClientId(clientId: string): Promise<OauthClient | null> {
    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findPaginated(query: ListOauthClientsQuery): Promise<{ items: OauthClient[]; total: number }> {
    const { page, pageSize, status, search } = query;
    const conditions = [];
    if (status) conditions.push(eq(oauthClients.status, status));
    if (search) conditions.push(ilike(oauthClients.clientName, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(oauthClients).where(where).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(oauthClients).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async updateStatus(id: string, status: ClientStatus): Promise<OauthClient | null> {
    const [row] = await db
      .update(oauthClients)
      .set({ status, updatedAt: new Date() })
      .where(eq(oauthClients.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async touchLastUsed(id: string, at: Date = new Date()): Promise<void> {
    await db.update(oauthClients).set({ lastUsedAt: at }).where(eq(oauthClients.id, id));
  }

  async deleteById(id: string): Promise<boolean> {
    const [row] = await db.delete(oauthClients).where(eq(oauthClients.id, id)).returning();
    return !!row;
  }
}
