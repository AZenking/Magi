import { eq, and, sql, ilike, inArray, asc } from "drizzle-orm";
import type {
  ICanonicalChannelRepository,
  CanonicalChannel,
  EpgStatus,
  OutputStatus,
  ChannelLifecycle,
} from "@/domain/output-composition";
import { chunk, safeBatchSize } from "@magi/utils";
import { db } from "./connection";
import { canonicalChannels, contentManifest } from "./schema";

function toDomain(
  row: typeof canonicalChannels.$inferSelect,
): CanonicalChannel {
  return {
    ...row,
    epgStatus: row.epgStatus as EpgStatus,
    outputStatus: row.outputStatus as OutputStatus,
    mergedFromIds: row.mergedFromIds,
    mergeMethod: row.mergeMethod as CanonicalChannel["mergeMethod"],
    lifecycle: row.lifecycle as ChannelLifecycle | undefined,
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
    group?: string;
    lifecycle?: string;
    sourcePresence?: string;
  }): Promise<{ items: CanonicalChannel[]; total: number }> {
    const {
      page,
      pageSize,
      epgStatus,
      outputStatus,
      hidden,
      disabled,
      search,
      group,
    } = params;
    const conditions = [];
    if (epgStatus) conditions.push(eq(canonicalChannels.epgStatus, epgStatus));
    if (outputStatus)
      conditions.push(eq(canonicalChannels.outputStatus, outputStatus));
    if (hidden !== undefined)
      conditions.push(eq(canonicalChannels.hidden, hidden));
    if (disabled !== undefined)
      conditions.push(eq(canonicalChannels.disabled, disabled));
    if (search)
      conditions.push(ilike(canonicalChannels.standardName, `%${search}%`));
    if (group) conditions.push(eq(canonicalChannels.standardGroup, group));
    // T056: lifecycle + sourcePresence filters.
    if (params.lifecycle)
      conditions.push(eq(canonicalChannels.lifecycle, params.lifecycle));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Stable ordering so multi-page clients never see duplicates or gaps:
    // channelNumber ASC NULLS LAST → standardName ASC → id ASC.
    const orderBy = [
      sql`${canonicalChannels.channelNumber} ASC NULLS LAST`,
      asc(canonicalChannels.standardName),
      asc(canonicalChannels.id),
    ];

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(canonicalChannels)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(canonicalChannels)
        .where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<CanonicalChannel | null> {
    const [row] = await db
      .select()
      .from(canonicalChannels)
      .where(eq(canonicalChannels.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: readonly string[]): Promise<CanonicalChannel[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(canonicalChannels)
      .where(inArray(canonicalChannels.id, [...ids]))
      .orderBy(
        sql`${canonicalChannels.channelNumber} ASC NULLS LAST`,
        asc(canonicalChannels.standardName),
        asc(canonicalChannels.id),
      );
    return rows.map(toDomain);
  }

  async findByEpgChannelId(
    epgChannelId: string,
  ): Promise<CanonicalChannel | null> {
    const [row] = await db
      .select()
      .from(canonicalChannels)
      .where(eq(canonicalChannels.epgChannelId, epgChannelId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByMergedFromId(
    mergedFromId: string,
  ): Promise<CanonicalChannel | null> {
    const [row] = await db
      .select()
      .from(canonicalChannels)
      .where(eq(canonicalChannels.mergedFromIds, mergedFromId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async createBatch(
    channels: Omit<CanonicalChannel, "id" | "createdAt" | "updatedAt">[],
  ): Promise<CanonicalChannel[]> {
    if (channels.length === 0) return [];
    const out: CanonicalChannel[] = [];
    await db.transaction(async (tx) => {
      for (const batch of chunk(channels, safeBatchSize(18))) {
        const rows = await tx
          .insert(canonicalChannels)
          .values(batch)
          .returning();
        out.push(...rows.map(toDomain));
      }
    });
    await bumpContentRevisions();
    return out;
  }

  async update(
    id: string,
    data: Partial<CanonicalChannel>,
  ): Promise<CanonicalChannel | null> {
    const [row] = await db
      .update(canonicalChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(canonicalChannels.id, id))
      .returning();
    if (row) await bumpContentRevisions();
    return row ? toDomain(row) : null;
  }

  async deleteAll(): Promise<number> {
    const result = await db.delete(canonicalChannels).returning();
    if (result.length > 0) await bumpContentRevisions();
    return result.length;
  }

  async batchUpdate(
    ids: string[],
    data: Partial<CanonicalChannel>,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(canonicalChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(inArray(canonicalChannels.id, ids))
      .returning();
    if (result.length > 0) await bumpContentRevisions();
    return result.length;
  }

  async batchDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(canonicalChannels)
      .where(inArray(canonicalChannels.id, ids))
      .returning();
    if (result.length > 0) await bumpContentRevisions();
    return result.length;
  }

  async findGroups(): Promise<{ name: string; count: number }[]> {
    // Count only active channels — same lifecycle scope as the open channels
    // endpoint, so group counts match what the TV actually sees.
    const rows = await db
      .select({
        name: canonicalChannels.standardGroup,
        count: sql<number>`count(*)::int`,
      })
      .from(canonicalChannels)
      .where(eq(canonicalChannels.lifecycle, "active"))
      .groupBy(canonicalChannels.standardGroup);
    return rows.map((r) => ({ name: r.name ?? "未分组", count: r.count }));
  }

  // --- Safe Operations (T056): lifecycle-aware queries + optimistic update. ---
  async updateIfVersion(
    id: string,
    data: Partial<CanonicalChannel>,
    expectedVersion: number,
  ): Promise<CanonicalChannel | null> {
    const [row] = await db
      .update(canonicalChannels)
      .set({
        ...(data.lifecycle !== undefined && { lifecycle: data.lifecycle }),
        ...(data.lifecycleReason !== undefined && {
          lifecycleReason: data.lifecycleReason,
        }),
        ...(data.trashedAt !== undefined && { trashedAt: data.trashedAt }),
        ...(data.purgeAfter !== undefined && { purgeAfter: data.purgeAfter }),
        ...(data.hidden !== undefined && { hidden: data.hidden }),
        ...(data.disabled !== undefined && { disabled: data.disabled }),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canonicalChannels.id, id),
          eq(canonicalChannels.version, expectedVersion),
        ),
      )
      .returning();
    if (row) await bumpContentRevisions();
    return row ? toDomain(row) : null;
  }

  async findTrashed(params: {
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ items: CanonicalChannel[]; total: number }> {
    const conditions = [eq(canonicalChannels.lifecycle, "trashed")];
    if (params.search)
      conditions.push(
        ilike(canonicalChannels.standardName, `%${params.search}%`),
      );
    const where = and(...conditions);
    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(canonicalChannels)
        .where(where)
        .orderBy(canonicalChannels.trashedAt)
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(canonicalChannels)
        .where(where),
    ]);
    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async countByLifecycle(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        lifecycle: canonicalChannels.lifecycle,
        count: sql<number>`count(*)::int`,
      })
      .from(canonicalChannels)
      .groupBy(canonicalChannels.lifecycle);
    const out: Record<string, number> = {
      active: 0,
      hidden: 0,
      disabled: 0,
      trashed: 0,
    };
    for (const r of rows) {
      const key = (r.lifecycle ?? "active") as string;
      out[key] = (out[key] ?? 0) + r.count;
    }
    return out;
  }
}

/**
 * Keep manual catalog edits on the same invalidation path as worker rebuilds.
 * The cache is an optimization, so a rollout where the new table is not yet
 * migrated must not turn an otherwise successful admin mutation into a 500.
 */
async function bumpContentRevisions(): Promise<void> {
  try {
    await db
      .insert(contentManifest)
      .values({
        id: 1,
        catalogRevision: 2,
        epgRevision: 2,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: contentManifest.id,
        set: {
          catalogRevision: sql`${contentManifest.catalogRevision} + 1`,
          epgRevision: sql`${contentManifest.epgRevision} + 1`,
          updatedAt: new Date(),
        },
      });
  } catch {
    // Best effort during expand/contract deployment; the next worker sync
    // restores a valid revision once the migration is available.
  }
}
