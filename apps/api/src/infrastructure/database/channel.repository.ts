import { eq, and, or, ilike, sql, inArray } from "drizzle-orm";
import type {
  IChannelRepository,
  Channel,
  EpgMatchType,
  StreamStatus,
  SourcePresence,
} from "@/domain/channel-catalog";
import { chunk, safeBatchSize } from "@magi/utils";
import { db } from "./connection";
import { channels } from "./schema";

function toDomain(row: typeof channels.$inferSelect): Channel {
  return {
    ...row,
    epgMatchType: row.epgMatchType as EpgMatchType,
    streamStatus: row.streamStatus as StreamStatus | null,
    sourcePresence: (row.sourcePresence ?? undefined) as
      | SourcePresence
      | undefined,
  };
}

export class ChannelRepository implements IChannelRepository {
  async findAll(query: {
    page: number;
    pageSize: number;
    sourceId?: string;
    search?: string;
  }): Promise<{ items: Channel[]; total: number }> {
    const { page, pageSize, sourceId, search } = query;
    const conditions = [];
    if (sourceId) conditions.push(eq(channels.m3uSourceId, sourceId));
    if (search)
      conditions.push(
        or(
          ilike(channels.displayName, `%${search}%`),
          ilike(channels.tvgId, `%${search}%`),
        ),
      );
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(channels)
        .where(where)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(channels)
        .where(where),
    ]);
    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<Channel | null> {
    const [row] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIdentity(channelIdentity: string): Promise<Channel | null> {
    const [row] = await db
      .select()
      .from(channels)
      .where(eq(channels.channelIdentity, channelIdentity))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByM3uSourceId(sourceId: string): Promise<Channel[]> {
    const rows = await db
      .select()
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId));
    return rows.map(toDomain);
  }

  async createBatch(
    channelData: Omit<Channel, "id" | "createdAt" | "updatedAt">[],
  ): Promise<Channel[]> {
    if (channelData.length === 0) return [];
    const out: Channel[] = [];
    await db.transaction(async (tx) => {
      for (const batch of chunk(channelData, safeBatchSize(23))) {
        const rows = await tx.insert(channels).values(batch).returning();
        out.push(...rows.map(toDomain));
      }
    });
    return out;
  }

  async update(id: string, data: Partial<Channel>): Promise<Channel | null> {
    const [row] = await db
      .update(channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channels.id, id))
      .returning();
    return row ? toDomain(row) : null;
  }

  async deleteByM3uSourceId(sourceId: string): Promise<number> {
    const result = await db
      .delete(channels)
      .where(eq(channels.m3uSourceId, sourceId))
      .returning();
    return result.length;
  }

  // --- Safe Operations (T035): stable upsert + identity-scoped queries. ---
  async upsertStable(
    data: Omit<Channel, "id" | "createdAt" | "updatedAt">,
  ): Promise<Channel> {
    // The schema keeps channelIdentity globally unique. Resolve the existing
    // row first so a source cannot silently take ownership of another source's
    // identity, while a legacy null-owned row can be attached safely.
    const now = new Date();
    const [existing] = await db
      .select({ id: channels.id, m3uSourceId: channels.m3uSourceId })
      .from(channels)
      .where(eq(channels.channelIdentity, data.channelIdentity))
      .limit(1);
    if (existing) {
      if (
        existing.m3uSourceId &&
        data.m3uSourceId &&
        existing.m3uSourceId !== data.m3uSourceId
      ) {
        throw new Error(
          `Channel identity belongs to another source: ${data.channelIdentity}`,
        );
      }
      const [row] = await db
        .update(channels)
        .set({
          m3uSourceId: data.m3uSourceId ?? existing.m3uSourceId,
          rawChannelId: data.rawChannelId,
          displayName: data.displayName,
          groupTitle: data.groupTitle,
          tvgId: data.tvgId,
          tvgLogo: data.tvgLogo,
          streamUrl: data.streamUrl,
          epgChannelId: data.epgChannelId,
          epgMatchType: data.epgMatchType,
          sourcePresence: "present",
          lastSeenAt: now,
          missingSince: null,
          version: sql`${channels.version} + 1`,
          updatedAt: now,
        })
        .where(eq(channels.id, existing.id))
        .returning();
      return toDomain(row!);
    }

    const [row] = await db
      .insert(channels)
      .values({
        channelIdentity: data.channelIdentity,
        m3uSourceId: data.m3uSourceId,
        rawChannelId: data.rawChannelId,
        displayName: data.displayName,
        groupTitle: data.groupTitle,
        tvgId: data.tvgId,
        tvgLogo: data.tvgLogo,
        streamUrl: data.streamUrl,
        epgChannelId: data.epgChannelId,
        epgMatchType: data.epgMatchType,
        active: data.active,
        streamStatus: data.streamStatus,
        streamResponseTime: data.streamResponseTime,
        streamCheckedAt: data.streamCheckedAt,
        streamError: data.streamError,
        sourcePresence: "present",
        lastSeenAt: now,
        missingSince: null,
      })
      .returning();
    return toDomain(row!);
  }

  async findBySourceAndIdentity(
    sourceId: string,
    channelIdentity: string,
  ): Promise<Channel | null> {
    const [row] = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          eq(channels.channelIdentity, channelIdentity),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async markMissing(
    sourceId: string,
    presentIdentities: readonly string[],
    now: Date,
  ): Promise<number> {
    // Mark every channel of this source whose identity is NOT in presentIdentities
    // as missing — no deletion (FR-014, data-model.md).
    const candidates = await db
      .select()
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId));
    const present = new Set(presentIdentities);
    const toMark = candidates.filter((c) => !present.has(c.channelIdentity));
    if (toMark.length === 0) return 0;
    const result = await db
      .update(channels)
      .set({
        sourcePresence: "missing",
        missingSince: now,
        version: sql`${channels.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          inArray(
            channels.channelIdentity,
            toMark.map((c) => c.channelIdentity),
          ),
        ),
      )
      .returning();
    return result.length;
  }
}
