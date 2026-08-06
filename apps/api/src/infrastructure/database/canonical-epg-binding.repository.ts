import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  CanonicalEpgBinding,
  CanonicalEpgBindingStatus,
  CanonicalEpgBindingWithSource,
  ICanonicalEpgBindingRepository,
} from "@/domain/output-composition";
import { db } from "./connection";
import { canonicalEpgBindings, contentManifest, xmltvSources } from "./schema";

function toDomain(
  row: typeof canonicalEpgBindings.$inferSelect,
): CanonicalEpgBinding {
  return {
    ...row,
    status: row.status as CanonicalEpgBindingStatus,
  };
}

export class CanonicalEpgBindingRepository
  implements ICanonicalEpgBindingRepository
{
  async findByCanonicalChannelId(
    canonicalChannelId: string,
  ): Promise<CanonicalEpgBindingWithSource | null> {
    const rows = await this.findRows([canonicalChannelId]);
    return rows[0] ?? null;
  }

  async findByCanonicalChannelIds(
    canonicalChannelIds: readonly string[],
  ): Promise<Map<string, CanonicalEpgBindingWithSource>> {
    const map = new Map<string, CanonicalEpgBindingWithSource>();
    if (canonicalChannelIds.length === 0) return map;
    for (const row of await this.findRows(canonicalChannelIds)) {
      map.set(row.canonicalChannelId, row);
    }
    return map;
  }

  async hasBindingsForXmltvSource(xmltvSourceId: string): Promise<boolean> {
    const [row] = await db
      .select({ canonicalChannelId: canonicalEpgBindings.canonicalChannelId })
      .from(canonicalEpgBindings)
      .where(eq(canonicalEpgBindings.xmltvSourceId, xmltvSourceId))
      .limit(1);
    return !!row;
  }

  async upsert(
    canonicalChannelId: string,
    data: Pick<
      CanonicalEpgBinding,
      | "xmltvSourceId"
      | "xmltvChannelId"
      | "status"
      | "matchType"
      | "locked"
      | "decisionReason"
    >,
    expectedVersion?: number,
  ): Promise<CanonicalEpgBinding | null> {
    const [existing] = await db
      .select()
      .from(canonicalEpgBindings)
      .where(eq(canonicalEpgBindings.canonicalChannelId, canonicalChannelId))
      .limit(1);

    if (existing) {
      if (
        expectedVersion !== undefined &&
        existing.version !== expectedVersion
      ) {
        return null;
      }
      const [updated] = await db
        .update(canonicalEpgBindings)
        .set({
          ...data,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              canonicalEpgBindings.canonicalChannelId,
              canonicalChannelId,
            ),
            eq(canonicalEpgBindings.version, existing.version),
          ),
        )
        .returning();
      if (updated) await bumpEpgRevision();
      return updated ? toDomain(updated) : null;
    }

    if (expectedVersion !== undefined && expectedVersion !== 0) return null;
    const [created] = await db
      .insert(canonicalEpgBindings)
      .values({ canonicalChannelId, ...data })
      .returning();
    if (created) await bumpEpgRevision();
    return created ? toDomain(created) : null;
  }

  private async findRows(
    canonicalChannelIds: readonly string[],
  ): Promise<CanonicalEpgBindingWithSource[]> {
    if (canonicalChannelIds.length === 0) return [];
    const rows = await db
      .select({
        binding: canonicalEpgBindings,
        sourceName: xmltvSources.name,
        sourceEnabled: xmltvSources.enabled,
        sourceLastSyncAt: xmltvSources.lastSyncAt,
        sourceFreshnessThresholdMinutes:
          xmltvSources.freshnessThresholdMinutes,
      })
      .from(canonicalEpgBindings)
      .leftJoin(
        xmltvSources,
        eq(canonicalEpgBindings.xmltvSourceId, xmltvSources.id),
      )
      .where(
        inArray(
          canonicalEpgBindings.canonicalChannelId,
          [...canonicalChannelIds],
        ),
      );

    return rows.map((row) => ({
      ...toDomain(row.binding),
      xmltvSourceName: row.sourceName,
      sourceEnabled: row.sourceEnabled,
      sourceLastSyncAt: row.sourceLastSyncAt,
      sourceFreshnessThresholdMinutes:
        row.sourceFreshnessThresholdMinutes,
    }));
  }
}

async function bumpEpgRevision(): Promise<void> {
  try {
    await db
      .insert(contentManifest)
      .values({ id: 1, epgRevision: 2, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: contentManifest.id,
        set: {
          epgRevision: sql`${contentManifest.epgRevision} + 1`,
          updatedAt: new Date(),
        },
      });
  } catch {
    // See canonical-channel.repository.ts: cache invalidation is best effort
    // while the additive migration is being rolled out.
  }
}
