/**
 * Drizzle adapter for ISourceSyncRepository (008-pipeline-reliability T006,
 * extended by 009-m3u-control-plane T009).
 *
 * Provides M3U source sync operations: loading source metadata, staging
 * import snapshots, stable upsert (preserving operator/health columns),
 * marking missing channels, recording sync status, and the new atomic apply
 * + reappearance/purge paths introduced by 009.
 */
import { eq, inArray, notInArray, and, or, sql, lt, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db";
import {
  m3uSources,
  channels,
  sourceImportSnapshots,
  sourceImportSnapshotItems,
  channelStreams,
  rawM3uChannels,
  xmltvSources,
  programmes,
  canonicalEpgBindings,
  canonicalChannelMembers,
  scheduledJobConfigs,
  channelOverrides,
} from "../../schema";
import type {
  ISourceSyncRepository,
  SourceSnapshotInput,
  ParsedSourceChannel,
  CurrentSourceChannel,
  StageSnapshotResult,
  ReconcileApplyResult,
  SourceDeleteImpact,
  SourceDeleteResult,
} from "@/domain/source-sync";

type SourceDeleteTarget = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: "m3u" | "xmltv";
};

export class DrizzleSourceSyncRepository implements ISourceSyncRepository {
  async loadSource(sourceId: string): Promise<SourceSnapshotInput | null> {
    const [row] = await db
      .select()
      .from(m3uSources)
      .where(eq(m3uSources.id, sourceId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      headers: row.headers as Record<string, string> | null,
      enabled: row.enabled,
      freshnessThresholdMinutes: row.freshnessThresholdMinutes ?? 60,
      version: row.version ?? 1,
    };
  }

  async stageSnapshot(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<{ snapshotId: string; itemCount: number }> {
    const snapshotId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

    await db.insert(sourceImportSnapshots).values({
      id: snapshotId,
      sourceId,
      sourceType,
      contentFingerprint,
      sourceVersion,
      status: "ready",
      itemCount: items.length,
      parserVersion: "1",
      preparedTaskId,
      createdAt: now,
      expiresAt,
    });

    if (items.length > 0) {
      const itemRows = items.map((item, index) => ({
        id: randomUUID(),
        snapshotId,
        channelIdentity: item.channelIdentity,
        collisionOrdinal: 0,
        itemOrder: index,
        payload: {
          displayName: item.displayName,
          groupTitle: item.groupTitle,
          tvgId: item.tvgId,
          tvgLogo: item.tvgLogo,
          streamUrl: item.streamUrl,
        },
        checksum: `${item.channelIdentity}:${contentFingerprint}`,
      }));
      await db.insert(sourceImportSnapshotItems).values(itemRows);
    }

    return { snapshotId, itemCount: items.length };
  }

  async loadCurrentChannels(sourceId: string): Promise<CurrentSourceChannel[]> {
    const rows = await db
      .select({
        id: channels.id,
        channelIdentity: channels.channelIdentity,
        displayName: channels.displayName,
        sourcePresence: channels.sourcePresence,
        version: channels.version,
      })
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId));
    return rows.map((r) => ({
      id: r.id,
      channelIdentity: r.channelIdentity,
      displayName: r.displayName,
      sourcePresence: r.sourcePresence ?? "present",
      version: r.version ?? 1,
    }));
  }

  async stableUpsert(
    sourceId: string,
    channel: ParsedSourceChannel,
  ): Promise<{ id: string; created: boolean }> {
    const now = new Date();
    const [existing] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.channelIdentity, channel.channelIdentity))
      .limit(1);

    if (existing) {
      // Update display fields only — preserve operator/health columns.
      await db
        .update(channels)
        .set({
          displayName: channel.displayName,
          groupTitle: channel.groupTitle,
          tvgId: channel.tvgId,
          tvgLogo: channel.tvgLogo,
          streamUrl: channel.streamUrl,
          sourcePresence: "present",
          lastSeenAt: now,
          missingSince: null,
        })
        .where(eq(channels.id, existing.id));
      return { id: existing.id, created: false };
    }

    const [row] = await db
      .insert(channels)
      .values({
        channelIdentity: channel.channelIdentity,
        m3uSourceId: sourceId,
        displayName: channel.displayName,
        groupTitle: channel.groupTitle,
        tvgId: channel.tvgId,
        tvgLogo: channel.tvgLogo,
        streamUrl: channel.streamUrl,
        sourcePresence: "present",
        firstSeenAt: now,
        lastSeenAt: now,
        active: true,
      })
      .returning({ id: channels.id });
    return { id: row!.id, created: true };
  }

  async markMissing(sourceId: string, presentIdentities: readonly string[], now: Date): Promise<number> {
    if (presentIdentities.length === 0) {
      const result = await db
        .update(channels)
        .set({ sourcePresence: "missing", missingSince: now })
        .where(and(eq(channels.m3uSourceId, sourceId), eq(channels.sourcePresence, "present")))
        .returning({ id: channels.id });
      return result.length;
    }

    const result = await db
      .update(channels)
      .set({ sourcePresence: "missing", missingSince: now })
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          eq(channels.sourcePresence, "present"),
          notInArray(channels.channelIdentity, [...presentIdentities]),
        ),
      )
      .returning({ id: channels.id });
    return result.length;
  }

  async recordSourceSync(
    sourceId: string,
    status: "success" | "failed",
    contentFingerprint: string | null,
  ): Promise<void> {
    await db
      .update(m3uSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastContentFingerprint: contentFingerprint,
      })
      .where(eq(m3uSources.id, sourceId));
  }

  // -------------------------------------------------------------------------
  // 009-m3u-control-plane (T009): idempotent snapshot staging, atomic apply,
  // reappearance, and 30-day purge.
  // -------------------------------------------------------------------------
  async stageSnapshotIdempotent(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<StageSnapshotResult> {
    // Reuse any unexpired snapshot for the same (source, fingerprint).
    const now = new Date();
    const [existing] = await db
      .select({ id: sourceImportSnapshots.id })
      .from(sourceImportSnapshots)
      .where(
        and(
          eq(sourceImportSnapshots.sourceId, sourceId),
          eq(sourceImportSnapshots.contentFingerprint, contentFingerprint),
          sql`${sourceImportSnapshots.expiresAt} > ${now}`,
        ),
      )
      .limit(1);
    if (existing) {
      return { snapshotId: existing.id, itemCount: items.length, reused: true };
    }
    const staged = await this.stageSnapshot(
      sourceId,
      sourceType,
      contentFingerprint,
      sourceVersion,
      items,
      preparedTaskId,
    );
    return { ...staged, reused: false };
  }

  async loadPresentChannels(sourceId: string): Promise<CurrentSourceChannel[]> {
    const rows = await db
      .select({
        id: channels.id,
        channelIdentity: channels.channelIdentity,
        displayName: channels.displayName,
        sourcePresence: channels.sourcePresence,
        version: channels.version,
      })
      .from(channels)
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          eq(channels.sourcePresence, "present"),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      channelIdentity: r.channelIdentity,
      displayName: r.displayName,
      sourcePresence: r.sourcePresence ?? "present",
      version: r.version ?? 1,
    }));
  }

  async applyAtomic(input: {
    readonly sourceId: string;
    readonly snapshotId: string;
    readonly changeSetId: string;
    readonly presentChannels: readonly ParsedSourceChannel[];
    readonly missingSourceChannelIds: readonly string[];
    readonly contentFingerprint: string;
    readonly sourceVersion: number;
    readonly now: Date;
  }): Promise<ReconcileApplyResult> {
    // NOTE: this method is intentionally structured so the entire body can be
    // wrapped in `db.transaction` once we move to a transaction-aware db
    // client. For 009's foundational layer we run sequential statements; the
    // apply use case still owns the change-set state transition so partial
    // failures surface as `failed` and leave recovery items intact.

    let sourcesActivated = 0;
    let sourcesDeactivated = 0;
    let streamsMissing = 0;
    let streamsRestored = 0;

    // 1. Stable upsert present channels (preserves operator/health columns).
    for (const channel of input.presentChannels) {
      const result = await this.stableUpsert(input.sourceId, channel);
      if (result.created) sourcesActivated++;
    }

    // 2. Mark missing channels + bump their missingSince if first time.
    if (input.missingSourceChannelIds.length > 0) {
      const newlyMissing = await db
        .update(channels)
        .set({ sourcePresence: "missing", missingSince: input.now })
        .where(
          and(
            eq(channels.m3uSourceId, input.sourceId),
            inArray(channels.id, [...input.missingSourceChannelIds]),
            eq(channels.sourcePresence, "present"),
          ),
        )
        .returning({ id: channels.id });
      sourcesDeactivated = newlyMissing.length;

      // Hide source-derived streams bound to those channels from output.
      const hiddenStreams = await db
        .update(channelStreams)
        .set({ missingSince: input.now })
        .where(
          and(
            inArray(channelStreams.rawChannelId, [
              ...input.missingSourceChannelIds,
            ]),
            isNotNull(channelStreams.rawChannelId),
          ),
        )
        .returning({ id: channelStreams.id });
      streamsMissing = hiddenStreams.length;
    }

    // 3. Record source sync success + fingerprint.
    await this.recordSourceSync(
      input.sourceId,
      "success",
      input.contentFingerprint,
    );

    return {
      sourcesActivated,
      sourcesDeactivated,
      streamsMissing,
      streamsRestored,
    };
  }

  async restoreMissing(
    sourceId: string,
    sourceChannelIds: readonly string[],
    now: Date,
  ): Promise<number> {
    if (sourceChannelIds.length === 0) return 0;
    const restoredChannels = await db
      .update(channels)
      .set({ sourcePresence: "present", missingSince: null })
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          inArray(channels.id, [...sourceChannelIds]),
          eq(channels.sourcePresence, "missing"),
        ),
      )
      .returning({ id: channels.id });

    if (restoredChannels.length > 0) {
      await db
        .update(channelStreams)
        .set({ missingSince: null })
        .where(
          and(
            inArray(
              channelStreams.rawChannelId,
              restoredChannels.map((r) => r.id),
            ),
            isNotNull(channelStreams.missingSince),
          ),
        );
    }
    return restoredChannels.length;
  }

  async purgeExpiredMissing(
    sourceId: string | null,
    retentionSeconds: number,
    now: Date,
  ): Promise<{ purgedSourceChannels: number; purgedStreams: number }> {
    const cutoff = new Date(now.getTime() - retentionSeconds * 1000);
    const sourceCondition = sourceId
      ? eq(channels.m3uSourceId, sourceId)
      : sql`true`;
    const purgedChannels = await db
      .update(channels)
      .set({ sourcePresence: "purged" })
      .where(
        and(
          sourceCondition,
          eq(channels.sourcePresence, "missing"),
          lt(channels.missingSince, cutoff),
        ),
      )
      .returning({ id: channels.id });

    let purgedStreams = 0;
    if (purgedChannels.length > 0) {
      const channelIds = purgedChannels.map((c) => c.id);
      const streamsResult = await db
        .update(channelStreams)
        .set({ missingSince: null })
        .where(
          and(
            inArray(channelStreams.rawChannelId, channelIds),
            isNotNull(channelStreams.rawChannelId),
          ),
        )
        .returning({ id: channelStreams.id });
      purgedStreams = streamsResult.length;
    }

    return {
      purgedSourceChannels: purgedChannels.length,
      purgedStreams,
    };
  }

  /**
   * Resolve a source-delete target without applying the sync source guard.
   * Disabled sources are still valid delete targets; a missing source is the
   * only invalid scope.
   */
  private async findSourceDeleteTarget(sourceId: string): Promise<SourceDeleteTarget | null> {
    const [m3u, xmltv] = await Promise.all([
      db
        .select({ id: m3uSources.id, name: m3uSources.name })
        .from(m3uSources)
        .where(eq(m3uSources.id, sourceId))
        .limit(1),
      db
        .select({ id: xmltvSources.id, name: xmltvSources.name })
        .from(xmltvSources)
        .where(eq(xmltvSources.id, sourceId))
        .limit(1),
    ]);
    if (m3u[0]) {
      return { sourceId: m3u[0].id, sourceName: m3u[0].name, sourceType: "m3u" };
    }
    if (xmltv[0]) {
      return { sourceId: xmltv[0].id, sourceName: xmltv[0].name, sourceType: "xmltv" };
    }
    return null;
  }

  async prepareSourceDelete(sourceId: string): Promise<SourceDeleteImpact> {
    const target = await this.findSourceDeleteTarget(sourceId);
    if (!target) throw new Error("Source not found");

    if (target.sourceType === "m3u") {
      const [raw, channelsForSource, memberships, streams, schedules] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(rawM3uChannels)
          .where(eq(rawM3uChannels.sourceId, sourceId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(channels)
          .leftJoin(rawM3uChannels, eq(channels.rawChannelId, rawM3uChannels.id))
          .where(
            or(
              eq(channels.m3uSourceId, sourceId),
              eq(rawM3uChannels.sourceId, sourceId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(canonicalChannelMembers)
          .innerJoin(channels, eq(canonicalChannelMembers.sourceChannelId, channels.id))
          .leftJoin(rawM3uChannels, eq(channels.rawChannelId, rawM3uChannels.id))
          .where(
            or(
              eq(channels.m3uSourceId, sourceId),
              eq(rawM3uChannels.sourceId, sourceId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(channelStreams)
          .leftJoin(channels, eq(channelStreams.sourceChannelId, channels.id))
          .leftJoin(rawM3uChannels, eq(channelStreams.rawChannelId, rawM3uChannels.id))
          .where(
            or(
              eq(channelStreams.m3uSourceId, sourceId),
              eq(channels.m3uSourceId, sourceId),
              eq(rawM3uChannels.sourceId, sourceId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(scheduledJobConfigs)
          .where(
            and(
              eq(scheduledJobConfigs.scopeType, "source"),
              eq(scheduledJobConfigs.scopeId, sourceId),
            ),
          ),
      ]);

      return {
        sourceId,
        sourceName: target.sourceName,
        sourceType: target.sourceType,
        counts: {
          rawChannels: Number(raw[0]?.count ?? 0),
          channels: Number(channelsForSource[0]?.count ?? 0),
          programmes: 0,
          epgMappings: 0,
          canonicalMemberships: Number(memberships[0]?.count ?? 0),
          streams: Number(streams[0]?.count ?? 0),
          schedules: Number(schedules[0]?.count ?? 0),
        },
      };
    }

    const [programmesForSource, epgMappings, schedules] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(programmes)
        .where(eq(programmes.sourceId, sourceId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(canonicalEpgBindings)
        .where(eq(canonicalEpgBindings.xmltvSourceId, sourceId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scheduledJobConfigs)
        .where(
          and(
            eq(scheduledJobConfigs.scopeType, "source"),
            eq(scheduledJobConfigs.scopeId, sourceId),
          ),
        ),
    ]);

    return {
      sourceId,
      sourceName: target.sourceName,
      sourceType: target.sourceType,
      counts: {
        rawChannels: 0,
        channels: 0,
        programmes: Number(programmesForSource[0]?.count ?? 0),
        epgMappings: Number(epgMappings[0]?.count ?? 0),
        canonicalMemberships: 0,
        streams: 0,
        schedules: Number(schedules[0]?.count ?? 0),
      },
    };
  }

  async applySourceDelete(sourceId: string): Promise<SourceDeleteResult> {
    const impact = await this.prepareSourceDelete(sourceId);

    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledJobConfigs)
        .where(
          and(
            eq(scheduledJobConfigs.scopeType, "source"),
            eq(scheduledJobConfigs.scopeId, sourceId),
          ),
        );

      if (impact.sourceType === "m3u") {
        const sourceRawChannels = await tx
          .select({ id: rawM3uChannels.id })
          .from(rawM3uChannels)
          .where(eq(rawM3uChannels.sourceId, sourceId));
        const sourceRawChannelIds = sourceRawChannels.map((channel) => channel.id);
        const sourceChannels = await tx
          .select({ id: channels.id })
          .from(channels)
          .leftJoin(rawM3uChannels, eq(channels.rawChannelId, rawM3uChannels.id))
          .where(
            or(
              eq(channels.m3uSourceId, sourceId),
              eq(rawM3uChannels.sourceId, sourceId),
            ),
          );
        const sourceChannelIds = sourceChannels.map((channel) => channel.id);

        // Remove source-derived output and memberships before deleting the
        // source-channel rows. Canonical channels themselves remain durable so
        // manual streams and operator lifecycle decisions are not destroyed.
        const streamWhere = sourceChannelIds.length > 0
          ? or(
              eq(channelStreams.m3uSourceId, sourceId),
              inArray(channelStreams.sourceChannelId, sourceChannelIds),
              ...(sourceRawChannelIds.length > 0
                ? [inArray(channelStreams.rawChannelId, sourceRawChannelIds)]
                : []),
            )
          : sourceRawChannelIds.length > 0
            ? or(
                eq(channelStreams.m3uSourceId, sourceId),
                inArray(channelStreams.rawChannelId, sourceRawChannelIds),
              )
            : eq(channelStreams.m3uSourceId, sourceId);
        await tx.delete(channelStreams).where(streamWhere);

        if (sourceChannelIds.length > 0) {
          await tx
            .delete(canonicalChannelMembers)
            .where(inArray(canonicalChannelMembers.sourceChannelId, sourceChannelIds));
          await tx
            .delete(channelOverrides)
            .where(inArray(channelOverrides.channelId, sourceChannelIds));
          await tx
            .delete(channels)
            .where(inArray(channels.id, sourceChannelIds));
        }

        await tx.delete(m3uSources).where(eq(m3uSources.id, sourceId));
        return;
      }

      // XMLTV bindings use RESTRICT on the source FK, so clear them before
      // deleting programmes and the source row.
      await tx
        .delete(canonicalEpgBindings)
        .where(eq(canonicalEpgBindings.xmltvSourceId, sourceId));
      await tx.delete(programmes).where(eq(programmes.sourceId, sourceId));
      await tx.delete(xmltvSources).where(eq(xmltvSources.id, sourceId));
    });

    return { ...impact, deleted: true };
  }
}
